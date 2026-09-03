#!/usr/bin/env bash
# Ticket 011: limpieza de imágenes/recursos Docker tras cada deploy, en la
# VM (capa gratuita — maximizar aprovechamiento de disco). Copiado tal
# cual de auth-core-mc/deploy/cleanup.sh (ticket 049, ver ese repo para
# el detalle completo de los hallazgos reales que motivaron cada
# salvaguarda) y adaptado solo de nombre. Ver docs/ARQUITECTURA.md,
# ticket 011, para el porqué de cada retención en este repo.
#
# Uso:
#   ./cleanup.sh dev     # conserva solo 1 imagen de release (la actual)
#   ./cleanup.sh qa      # conserva solo 1 imagen de release (la actual)
#   ./cleanup.sh prod    # conserva 2 (la actual + la anterior, rollback)
#
# Deliberadamente NO usa "docker system prune -af" (que borraría CUALQUIER
# imagen no usada por un contenedor corriendo, incluida la anterior de PROD
# que sí queremos conservar para rollback) — en su lugar, borra por nombre
# de repositorio ("mail-core-mc-dev"/"mail-core-mc-qa"/"mail-core-mc-prod")
# más allá del límite de retención, y solo entonces corre los prune
# genéricos (dangling, build cache, contenedores detenidos) que son siempre
# seguros de limpiar.
#
# Hallazgo real (primer deploy-dev del rediseño): la versión anterior de
# este script ordenaba las imágenes SOLO por CreatedAt para decidir cuál
# es "la actual" — y borró la imagen que estaba corriendo de verdad.
# Causa: cuando el código de ./backend no cambia entre commits (solo
# cambian archivos de infra/workflow), "docker build" reutiliza el cache
# de capas y produce una imagen con el MISMO CreatedAt exacto que un build
# anterior — dos tags de SHAs distintos pueden empatar en fecha, y el
# orden de "sort" en un empate no está garantizado. Fix: "la imagen
# actual" se determina resolviendo el tag ":current" (que cada deploy
# apunta explícitamente a lo que de verdad se desplegó), no por fecha —
# y además, nunca se borra una imagen que un contenedor corriendo esté
# usando de verdad en este momento, sin importar qué diga el cálculo de
# retención (salvaguarda independiente).
set -euo pipefail

ENV="${1:?uso: cleanup.sh <dev|qa|prod>}"
case "$ENV" in
  dev) KEEP=1 ;;
  qa) KEEP=1 ;;
  prod) KEEP=2 ;;
  *) echo "❌ ambiente desconocido: $ENV (usar 'dev', 'qa' o 'prod')" >&2; exit 1 ;;
esac

REPO="mail-core-mc-$ENV"

echo "== Retención de imágenes de release para $REPO (conservar $KEEP) =="

# Imagen "actual" = a la que apunta $REPO:current ahora mismo (fuente de
# verdad real de qué está desplegado, la pone el propio job de deploy en
# cada run) — nunca se borra, pase lo que pase con el resto del cálculo.
CURRENT_ID=""
if docker image inspect "$REPO:current" >/dev/null 2>&1; then
  CURRENT_ID=$(docker image inspect --format '{{.Id}}' "$REPO:current" | cut -d: -f2 | cut -c1-12)
fi

if [ -z "$CURRENT_ID" ]; then
  echo "⚠️  No se encontró $REPO:current — ¿corrió el deploy alguna vez? Nada que limpiar." >&2
else
  echo "Imagen actual ($REPO:current): $CURRENT_ID"
fi

# IDs de imágenes de este repositorio, más nuevas primero (por fecha de
# creación real de la imagen) — se usa solo para decidir, ENTRE LAS QUE NO
# SON LA ACTUAL, cuál(es) conservar para rollback (PROD) y cuál(es)
# borrar. `while read` en vez de `mapfile` (bash4+) a propósito: el bash
# 3.2 que trae macOS de fábrica (sin `mapfile`) también debe poder correr/
# probar este script sin depender de qué bash termine ejecutándolo.
IMAGE_IDS=()
while IFS= read -r id; do
  IMAGE_IDS+=("$id")
done < <(
  docker images "$REPO" --format '{{.CreatedAt}}|{{.ID}}' \
    | sort -r \
    | awk -F'|' '{print $2}' \
    | awk '!seen[$0]++'
)

TOTAL=${#IMAGE_IDS[@]}
echo "Imágenes encontradas para $REPO: $TOTAL"

OTHERS=()
for id in "${IMAGE_IDS[@]}"; do
  if [ "$id" != "$CURRENT_ID" ]; then
    OTHERS+=("$id")
  fi
done

KEEP_OTHERS=$((KEEP > 0 ? KEEP - 1 : 0))
if [ -z "$CURRENT_ID" ]; then
  # Sin ":current" resuelto no hay forma segura de saber cuál es la
  # actual — no se borra nada por esta vía (los prune genéricos de abajo
  # igual corren).
  echo "Nada que borrar (no se pudo determinar la imagen actual)."
elif [ "${#OTHERS[@]}" -gt "$KEEP_OTHERS" ]; then
  if [ "$KEEP_OTHERS" -gt 0 ]; then
    TO_REMOVE=("${OTHERS[@]:$KEEP_OTHERS}")
  else
    TO_REMOVE=("${OTHERS[@]}")
  fi

  # Salvaguarda independiente del cálculo de arriba: nunca borrar una
  # imagen que un contenedor corriendo esté usando de verdad ahora mismo.
  SAFE_TO_REMOVE=()
  for id in "${TO_REMOVE[@]}"; do
    if [ -n "$(docker ps -q --filter "ancestor=$id")" ]; then
      echo "⚠️  Salto $id — un contenedor corriendo lo está usando de verdad, pese al cálculo de retención."
    else
      SAFE_TO_REMOVE+=("$id")
    fi
  done

  if [ "${#SAFE_TO_REMOVE[@]}" -gt 0 ]; then
    echo "Borrando ${#SAFE_TO_REMOVE[@]} imagen(es) más allá de la retención: ${SAFE_TO_REMOVE[*]}"
    docker rmi -f "${SAFE_TO_REMOVE[@]}"
  fi
else
  echo "Nada que borrar (dentro del límite de retención)."
fi

echo "== Limpieza general (dangling, build cache, contenedores detenidos) =="
docker image prune -f
docker builder prune -f
docker container prune -f

echo "== Estado de disco tras la limpieza =="
docker system df
