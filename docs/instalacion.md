# Instalar Lebloc en la PC del mostrador (Windows)

## Generar el instalador

En la PC de desarrollo (Linux, con Wine instalado), con el `.env` del cliente de Google listo (ver [Backup en Google Drive](#backup-en-google-drive)):

```bash
npm run dist:win
```

Queda `dist/Lebloc-Setup-<versión>.exe`. Copialo a un pendrive.

## Instalar

1. En la PC del mostrador, abrí el `.exe`. Se instala para ese usuario de Windows y crea el acceso directo "Lebloc" en el escritorio.
2. Como el instalador no está firmado, Windows muestra "Windows protegió su PC". Tocá **Más información → Ejecutar de todas formas**.

Para actualizar, instalá el `.exe` nuevo encima. Los datos no se tocan.

## Dónde quedan los datos

- La base: `%APPDATA%\Lebloc\lebloc.db`.
- Los backups automáticos, que se hacen al abrir y al cerrar la app: `%APPDATA%\Lebloc\backups\`.
- El log de errores: `%APPDATA%\Lebloc\logs\`.

Si la PC se rompe, solo se salvan los datos que tengan una copia fuera de ella. En **Ajustes → Backup** hay dos formas, y se pueden usar las dos:

- **Copia en Google Drive:** cada backup se sube a la carpeta `Lebloc backups` de la cuenta de Google del local (ver abajo).
- **Copia en una carpeta externa:** cada backup se copia también a un pendrive o a cualquier otra carpeta.

## Backup en Google Drive

### Configurar Google Cloud (una sola vez, en la PC de desarrollo)

La app necesita un cliente OAuth propio para pedirle permiso a la cuenta de Google.

1. En [console.cloud.google.com](https://console.cloud.google.com), creá un proyecto "Lebloc".
2. **APIs y servicios → Biblioteca:** habilitá **Google Drive API**.
3. **Pantalla de consentimiento de OAuth:** tipo de usuario **Externo**, nombre "Lebloc" y tu email de contacto. En los permisos, agregá solo `.../auth/drive.file`: con ese permiso la app ve únicamente los archivos que crea ella.
4. **Publicá la app ("En producción").** En modo de prueba, Google vence el permiso a los 7 días y las subidas se cortan cada semana. Con `drive.file` no hace falta que Google la verifique.
5. **Credenciales → Crear credenciales → ID de cliente de OAuth**, de tipo **App de escritorio**.
6. Copiá el ID y el secret en un `.env` en la raíz del repo. Ya está en `.gitignore`, así que nunca se sube a Git:

   ```bash
   MAIN_VITE_GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com
   MAIN_VITE_GOOGLE_CLIENT_SECRET=<secret>
   ```

   El instalador lleva esos valores adentro. Google no considera secreto el de una app de escritorio, porque cualquiera que tenga el `.exe` podría leerlo. Un instalador generado sin `.env` funciona igual, pero sin Google Drive.

### Conectar la cuenta (en el mostrador)

1. En la cuenta de Google del local, activá la **verificación en dos pasos**: los backups tienen datos personales, incluidos los de menores.
2. **Ajustes → Backup → Conectar Google Drive.** Se abre el navegador: iniciá sesión con esa cuenta, aceptá el permiso y volvé a Lebloc.
3. La app sube un backup en ese momento y después uno cada vez que se abre y se cierra. En Drive quedan los mismos que en la PC: los últimos 10 y uno por día del último mes.

El permiso queda guardado y cifrado para ese usuario de Windows en `%APPDATA%\Lebloc\google-drive.token`, fuera de la base, así que nunca viaja dentro de un backup. Si alguien quita el acceso desde la cuenta de Google, Ajustes y el Mostrador avisan: tocá **Volver a conectar**.

Para restaurar desde Drive, bajá el backup que quieras de la carpeta `Lebloc backups` y usá **Ajustes → Restaurar backup**. La cuenta conectada se mantiene.

## Pasar los datos de una PC a otra

1. En la PC vieja: **Ajustes → Exportar backup**.
2. En la nueva: **Ajustes → Restaurar backup** y elegí ese archivo.
