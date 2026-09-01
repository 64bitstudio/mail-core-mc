// Ticket 002 de platform, punto 11: Jenkinsfile MÍNIMO -- deja la infra
// (ramas dev/qa/prod, branch protection, webhook automático a Jenkins,
// Shared Library) lista y funcionando de punta a punta, SIN el pipeline
// de aplicación real de mail-core-mc (build/test/Sonar con el
// toolchain Node, Dockerfile, deploy/docker-compose.*.yml, cleanup.sh
// -- eso es el ticket propio 011 de este repo, sin empezar, a propósito
// fuera de alcance aquí).
//
// config.deploy: false desactiva TODAS las etapas de imagen/vhost/
// deploy dev-qa-prod de corePipeline (no existen Dockerfile ni
// deploy/docker-compose.*.yml todavía). config.buildAndTest se omite
// del todo (no hay toolchain Node instalado en la imagen de Jenkins
// todavía, ni sonar-scanner para JS/TS) -- corePipeline lo trata como
// placeholder explícito, no oculto.
//
// Cuando el ticket 011 de este repo arranque, este Jenkinsfile se
// actualiza: agrega buildAndTest (npm ci + prisma generate + test +
// sonar-scanner) y quita deploy:false (o lo deja en true, su default)
// una vez existan Dockerfile/deploy/docker-compose.*.yml/cleanup.sh.

@Library('platform') _

corePipeline(
    projectName: 'mail-core-mc',
    deploy: false
)
