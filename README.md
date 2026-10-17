# PELICULEO PWA

App gratuita para catalogar peliculas vistas y por ver.

## Como probarla

Desde esta carpeta:

```powershell
python -m http.server 5173
```

Abre:

```text
http://localhost:5173
```

## Que incluye

- Catalogo guardado en el navegador con `localStorage`.
- Filtros por texto, genero y estado.
- Estado `Vista` o `Por ver`.
- Valoracion propia de 0 a 5 estrellas.
- Caratula por enlace o imagen subida, sinopsis y generos editables.
- Busqueda online sin pagar usando Wikipedia.
- Opcion para usar TMDB con una API key gratuita.
- Manifest y service worker para instalar como PWA.

## TMDB global

Para usar TMDB siempre en todos los dispositivos, pega tu clave en `config.js`:

```js
window.PELICULEO_CONFIG = {
  tmdbApiKey: "TU_API_KEY"
};
```

Despues despliega de nuevo:

```powershell
firebase deploy --only hosting
```

## Notas

Wikipedia no necesita clave, pero a veces devuelve paginas generales o caratulas pequenas.
TMDB requiere crear una clave gratuita y pegarla en `Ajustes`.

Para publicarla gratis mas adelante, GitHub Pages, Netlify o Cloudflare Pages encajan bien.
