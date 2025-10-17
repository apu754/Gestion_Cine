# Gestión de Salas de Cine - Full Stack App

Este proyecto es una aplicación **full stack** para la gestión de salas de cine, que incluye funcionalidades tanto administrativas como sociales.  
Permite:

- Listar funciones y películas en cartelera
- Registrar e iniciar sesión de usuarios
- Puntuar películas vistas
- Generar recomendaciones basadas en actores, director, productora y preferencias del usuario
- Funcionalidades tipo red social para cineastas

---

## Estructura del Proyecto
```
gestion-cine/
├── backend-cinegestion/
│   ├── sql/
│   │   ├── 00_schema_cinegestion.sql
│   │   ├── 01_test_helpers.sql
│   │   └── 02_seed_dev.sql
│   ├── src/
│   │   ├── common/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── modules/
│   │   ├── tests/
│   │   ├── utils/
│   │   ├── app.js
│   │   └── server.js
│   ├── .gitignore
│   ├── jest.config.mjs
│   ├── package-lock.json
│   ├── package.json
│   └── sonar-project.properties
├── .gitignore
└── README.md
```

## gestion-cine

- frontend/ # React + JavaScript
- backend/ # NodeJS + PostgreSQL
- docker-compose.yml # (próximamente)

---

## Tecnologías utilizadas

### 🖥 Frontend

- [x] React
- [x] JavaScript

### 🧠 Backend

- [x] NodeJS
- [x] JavaScript
- [x] PostgreSQL
- [x] TypeORM o Prisma (a definir)
- [x] JWT para autenticación

### 🧪 Herramientas de Calidad

- ESLint & Prettier
- Jest / Supertest (backend)
- Selenium (pruebas E2E)
- SonarQube
- Docker (para entorno unificado, próximamente)

---

## 🔧 Instalación y ejecución

### 1. Clona el repositorio

```bash
git clone https://github.com/apu754/Gestion_Cine.git
cd cinegestion

```

### 2. Ejecutar el Frontend

```bash
cd frontend
npm install
npm run dev
```

### 3. Ejecutar el Backend

```bash
Copy
Edit
cd backend
npm install
npm run start:dev

```
