# CATS FROST – Página del juego

Página con intro "modo hacker", video del gato, concepto del juego, galaxia con 3 carpetas
(Video, Tráiler, Descargas) y dos modos: **Usuario** (ver y descargar) y **Administrador** (publicar).

## Requisitos
Node.js 18 o superior (https://nodejs.org). No hay que instalar nada más.

## Usar (Windows: doble clic en INICIAR.bat; INICIAR-PUBLICO.bat además crea un enlace para compartir)
1. Abre una terminal en esta carpeta.
2. `npm start`
3. Abre http://localhost:8080
4. Contraseña de administrador: **GATO** (en mayúsculas). Se guarda en `data/config.json`
   (campo `password`) y la puedes cambiar ahí. Para usar otra sin tocar archivos:
   - Windows (PowerShell): `$env:ADMIN_PASSWORD="mi-clave"; npm start`
   - Mac/Linux: `ADMIN_PASSWORD=mi-clave npm start`

Sin servidor (Live Preview): el botón Administrador también pide la contraseña (GATO) y entra en modo vista previa;
solo sirve para ver el diseño: lo que pruebes ahí no se publica.

## Publicar (admin)
Entra como Administrador → Ir a descargar el juego → abre la carpeta → sube el video del tráiler
(.mp4/.webm), videos, o el APK (cualquier archivo) en Descargas. Los usuarios solo ven y descargan.
Los archivos quedan en `data/` (haz copia de esa carpeta).

## Compartir con otras personas
La subida necesita este servidor Node en marcha; Live Server / Live Preview solos NO guardan archivos
(la página igual abre, pero en modo vista previa local).
- Prueba rápida: `npx cloudflared tunnel --url http://localhost:8080` (o ngrok) y comparte el enlace.
- Definitivo: un hosting con Node y disco persistente (VPS, Railway/Render con volumen, etc.).
  Usa HTTPS, define `ADMIN_PASSWORD`, `DATA_DIR` (carpeta persistente) y `TRUST_PROXY=1` si hay proxy.
- Variables: `PORT` (8080), `MAX_UPLOAD_MB` (2048), `DATA_DIR`, `ADMIN_PASSWORD`, `TRUST_PROXY`.

## Editar textos
`public/content.js`: nombre, conceptos del juego, palabras de la intro y carpetas.

## Subir a GitHub Pages (botón "Guardar")
GitHub Pages no tiene servidor, así que el botón **Guardar** (modo Administrador) sube el archivo a TU repositorio con la API de GitHub:
1. Sube todo el proyecto a un repositorio y activa Pages.
2. Crea un token en GitHub → Settings → Developer settings → Fine-grained tokens: solo ese repositorio, permiso **Contents: Read and write**.
3. Abre tu página → Administrador (GATO) → una carpeta → escribe repositorio (usuario/nombre), token y la carpeta donde está index.html (ej. `public`) → Conectar.
4. Elige el video/APK → **Guardar**. En 1–2 minutos todos lo ven. Límite de GitHub: ~100 MB por archivo (comprime el video si pesa más).
El token queda solo en tu navegador. Los usuarios solo ven y descargan lo guardado en `media/`.

## Archivos pesados SIN servidor (Cloudflare R2) – botón "Guardar" sube directo a la nube
Una sola vez:
1. Cuenta en https://dash.cloudflare.com → **R2 Object Storage** (plan gratis ~10 GB; suele pedir tarjeta).
2. Crea un bucket (ej. `cats-frost`).
3. Bucket → Settings → **Public access** → R2.dev subdomain → Allow. Copia la URL pública (`https://pub-xxxx.r2.dev`).
4. Bucket → Settings → **CORS Policy** → pega:
   `[{"AllowedOrigins":["*"],"AllowedMethods":["GET","PUT","DELETE","HEAD"],"AllowedHeaders":["*"],"MaxAgeSeconds":3600}]`
5. R2 → **Manage API tokens** → Create token → permiso *Object Read & Write* para ese bucket. Copia Access Key ID, Secret Access Key y el endpoint S3 (`https://xxxx.r2.cloudflarestorage.com`).
6. En la página: Administrador (GATO) → una carpeta → pega los datos → Conectar → elige el video → **Guardar**.
7. En `public/content.js` pon `cloud: { publicUrl: 'https://pub-xxxx.r2.dev' }` y publica la página (así los usuarios lo ven).
Las claves quedan solo en tu navegador (no van en el código).

## Firebase (Storage + Auth) para archivos pesados con GitHub Pages
La página usa Firebase si pegas tu `firebaseConfig` en `public/content.js` (objeto `firebase`). Admin = correo `admin@catsfrost.app` con contraseña GATO
(Firebase pide 6+ caracteres: la página agrega `#cf2` por dentro, tú sigues escribiendo GATO).
Reglas de Storage:
    rules_version = '2';
    service firebase.storage { match /b/{b}/o { match /{all=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.email == 'admin@catsfrost.app' && (request.method == 'delete' || request.resource.size < 2 * 1024 * 1024 * 1024);
    } } }
