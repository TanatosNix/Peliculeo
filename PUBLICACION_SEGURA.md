# Configuración antes de ejecutar

1. Copia `config.example.js` a `config.js` para usar la aplicación localmente. La copia comienza sin clave TMDB y sin conexión a Firebase.
2. El archivo `config.js` está excluido de Git. Introduce solo la configuración que vayas a usar para tu copia.
3. La clave TMDB del proyecto original no se incluye. Si la has publicado o compartido, sustituirla requiere revocarla o regenerarla en TMDB; no basta con borrar el texto del código.

## Advertencia sobre la conexión a la nube

Las reglas locales originales permitían leer y escribir `/movies` sin autenticación. Esta copia utiliza una plantilla que deniega el acceso. Si se despliega esta plantilla, desactivará la sincronización de películas en la nube. Primero hay que definir autenticación y permisos apropiados y comprobarlos. No se ha modificado ni desplegado nada en el proyecto Firebase real.

No se ha verificado cuáles son las reglas activas actualmente en producción. Excluir la configuración de Git no resuelve una base de datos abierta.

El README original describe el modo local y puede no reflejar toda la sincronización añadida posteriormente. Revisa ese apartado antes de presentar la app como servicio multiusuario.

## Archivos excluidos

Se excluyeron la configuración real, `firebase-debug.log`, el estado de despliegue y los metadatos de Windows. Los registros contenían referencias a cuenta y rutas locales.

`config.js` seguirá siendo visible para los visitantes cuando se sirva como JavaScript. Para mantener secreta una credencial se necesita lógica de servidor; una variable en un archivo del navegador no la protege.
