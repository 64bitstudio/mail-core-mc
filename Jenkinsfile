// Ticket 011: reemplaza el Jenkinsfile mínimo de platform/002 (punto 11,
// `deploy: false`, sin buildAndTest) — ahora que existen
// backend/Dockerfile, deploy/docker-compose.{dev,qa,prod}.yml y
// deploy/cleanup.sh, se activa el pipeline de aplicación real: build +
// test con cobertura + análisis SonarQube (toolchain Node, distinto del
// Gradle de auth-core-mc) + build de imagen + deploy dev/qa/prod +
// promoción manual a PROD (gate exclusivo de Marco, sin cambios -- lo
// gestiona corePipeline mismo).
//
// containerPort: 3000 (Nest escucha en process.env.PORT ?? 3000, ver
// backend/src/main.ts) -- el default de corePipeline es 8080 (asume
// Spring Boot), así que hay que pasarlo explícito.
// healthPath: '/health' (backend/src/health/health.controller.ts) -- NO
// existe /actuator/health aquí, es un healthcheck propio (Postgres +
// Redis, sin @nestjs/terminus, ver el comentario de ese archivo).
// healthyPattern: la respuesta exitosa es {"database":"ok","redis":"ok"}
// (el default de corePipeline, '"status":"UP"', es de Spring Boot
// Actuator y nunca aparecería aquí).
//
// vhostFile/certbotDomains: pendientes de un commit aparte, a propósito
// -- requieren que Marco decida el subdominio público de la app (ver
// docs/ARQUITECTURA.md, ticket 011, "Subdominio público -- pendiente de
// decisión de Marco"; mail.64bitstudio.com ya es el hostname del MTA,
// ticket 001/009, no puede reusarse para esto). Hasta entonces, DEV/QA/
// PROD se despliegan y se verifican por el puerto de host publicado en
// cada docker-compose.<env>.yml (8083/8084/8085) y por nombre de
// contenedor dentro de la red "edge" -- sin exposición pública todavía,
// igual que auth-core-mc antes de que existiera su vhost (ticket 049).
//
// Requiere Node.js 24 + sonar-scanner CLI en la imagen de Jenkins --
// agregados en platform (deploy/vm-infra/jenkins/Dockerfile, ticket
// platform/007), mismo patrón que la adición de Temurin 25 para
// auth-core-mc (ver corePipeline.groovy). El withEnv de más abajo activa
// el PATH del scanner SOLO para este closure, sin tocar el resto del
// contenedor de Jenkins.
@Library('platform') _

corePipeline(
    projectName: 'mail-core-mc',
    containerPort: 3000,
    healthPath: '/health',
    healthyPattern: '"database":"ok"',
    buildAndTest: {
        withEnv(["PATH+SONAR=/opt/sonar-scanner/bin"]) {
            dir('backend') {
                sh 'npm ci'
                // src/generated/prisma es código generado, gitignorado a
                // propósito -- sin este paso el build falla (mismo
                // hallazgo real que ya documentaba el ci.yml retirado).
                sh 'npx prisma generate'

                // Postgres/Redis efímeros de test, vía docker.sock
                // (Jenkins ya lo monta) -- mismo patrón que el ci.yml
                // retirado (GitHub Actions). COMPOSE_PROJECT_NAME
                // distinto de "mail-core-mc" (el que usa dev local) --
                // evita chocar con un dev local corriendo en paralelo en
                // la misma VM/Mac.
                withEnv(['COMPOSE_PROJECT_NAME=mail-core-mc-ci']) {
                    sh 'docker compose up -d'
                    try {
                        // docker compose up -d retorna en cuanto el
                        // contenedor arranca, no cuando Postgres ya
                        // acepta conexiones -- mismo hallazgo real que ya
                        // documentaba el ci.yml retirado.
                        sh '''
                            for i in $(seq 1 30); do
                                docker compose exec -T postgres pg_isready -U mail_core_mc && exit 0
                                sleep 1
                            done
                            echo "Postgres no respondio a tiempo" >&2
                            exit 1
                        '''
                        script {
                            def pgPort = sh(script: 'docker compose port postgres 5432 | cut -d: -f2', returnStdout: true).trim()
                            def redisPort = sh(script: 'docker compose port redis 6379 | cut -d: -f2', returnStdout: true).trim()
                            withEnv([
                                "DATABASE_URL=postgresql://mail_core_mc:mail_core_mc_dev@localhost:${pgPort}/mail_core_mc?schema=public",
                                "REDIS_URL=redis://localhost:${redisPort}"
                            ]) {
                                withSonarQubeEnv('sonarqube-vm') {
                                    sh 'npx prisma migrate deploy'
                                    sh 'npm run build'
                                    sh 'npm run test:cov'
                                    sh 'sonar-scanner'
                                }
                            }
                        }
                    } finally {
                        sh 'docker compose down'
                    }
                }
            }
        }
    }
)
