# Instalar Lebloc en la PC del mostrador (Windows)

## Generar el instalador

En la PC de desarrollo (Linux, con Wine instalado):

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

En **Ajustes → Backup**, elegí una carpeta externa (un pendrive o una carpeta de Google Drive) para que cada backup se copie también ahí. Si la PC se rompe, esa copia es la que salva los datos.

## Pasar los datos de una PC a otra

1. En la PC vieja: **Ajustes → Exportar backup**.
2. En la nueva: **Ajustes → Restaurar backup** y elegí ese archivo.
