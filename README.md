# Carruseles Mantua para GitHub Pages

Tres carruseles de clientes —comercial, industria y residencial— para insertar en Google Sites. Repositorio nuevo: [mantuagestion-lab/CARRUSEL-LOGOS.](https://github.com/mantuagestion-lab/CARRUSEL-LOGOS.). El punto al final forma parte del nombre. Los enlaces se generan desde la dirección real de la publicación.

El código y las imágenes se guardan en el mismo repositorio. El carrusel publicado no depende de esta conversación, de bibliotecas externas ni de los sitios donde se obtuvieron algunos logos.

## Activar la publicación una sola vez

1. Inicia sesión con **mantuagestion-lab**. No necesitas crear otro repositorio ni subir un ZIP.
2. Abre [Settings → Pages](https://github.com/mantuagestion-lab/CARRUSEL-LOGOS./settings/pages). En **Build and deployment → Source**, selecciona **GitHub Actions**. No elijas una plantilla ni crees otro archivo de publicación: este repositorio ya contiene el necesario.
3. Abre [Actions → Publicar carrusel Mantua](https://github.com/mantuagestion-lab/CARRUSEL-LOGOS./actions/workflows/update-manifest.yml). Si la primera ejecución falló porque Pages todavía no estaba activo, pulsa **Run workflow**, selecciona **main** y confirma **Run workflow**.
4. Cuando termine en verde, regresa a **Settings → Pages** y pulsa **Visit site**. Se abrirá el panel con los tres carruseles y sus botones para copiar enlaces o códigos.

La dirección prevista es `https://mantuagestion-lab.github.io/CARRUSEL-LOGOS./`; estará disponible cuando la publicación termine correctamente. No reemplaces los bloques actuales de Google Sites hasta comprobar que los nuevos funcionan.

GitHub Pages permite publicar sitios de repositorios públicos con GitHub Free. [Documentación de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## Insertarlos de nuevo en Google Sites

1. Abre el panel publicado y pulsa **Copiar enlace** en el grupo correspondiente. También puedes usar **Copiar código** para pegar el iframe completo.
2. En el editor de Google Sites, abre la página y utiliza **Insertar → Insertar/Incorporar → Por URL**. Pega el enlace e inserta el carrusel. Para pegar un iframe, usa la pestaña de código.
3. Ajusta el alto del bloque en Google Sites. El punto de partida es **144 px** de alto, **72 px** de alto máximo del logo, **12 px** de separación y **42 px/s** de movimiento.
4. Repite con los otros grupos. Comprueba las vistas de computadora y celular y pulsa **Publicar** en Google Sites.

Los enlaces apuntan a la cuenta y al repositorio nuevos. No hay que escribir el usuario dentro del código. El carrusel se adapta al espacio que le da Google Sites; no puede cambiar por sí solo el tamaño del bloque exterior.

## Calidad de los logos

La revisión inicial contiene **31 logos: 11 mejorados y 20 pendientes de un original mejor**. Los archivos iniciales medían 80 × 50 px. Honda se recuperó del historial; se incorporaron SVG y archivos de mayor resolución para otras diez marcas.

La lista está en [LOGOS.md](LOGOS.md). El panel publicado también tiene **Revisar la calidad y el origen de los logos**, con imágenes y procedencia.

- Para los pendientes, utiliza un **SVG original**, un **PDF vectorial** o una imagen original de buena resolución. Para este carrusel suele bastar una anchura de 600 px, siempre que el logo ocupe realmente el archivo.
- Aumentar a 600 px una imagen de 80 px conserva su falta de detalle. Los pendientes mantienen su tamaño natural.
- Algunas versiones oficiales actuales usan otra disposición o fondo. La ficha de cada logo documenta esa elección para revisarla antes de publicar la página comercial.

## Cambiar imágenes después

Conserva las carpetas logos/INDUSTRIA, logos/COMERCIAL y logos/RESIDENCIAL. Puedes añadir, sustituir o quitar archivos PNG, JPG, WebP, SVG o GIF estáticos. Al sustituir un PNG por un SVG, elimina el PNG anterior para que la marca no aparezca dos veces.

Cada cambio en main construye y publica la página, sus imágenes y el catálogo. Cada archivo recibe una revisión según su contenido para evitar imágenes antiguas en caché. No es necesario editar manifest.json a mano.

Los nombres accesibles y la procedencia están en logos/catalogo.json; actualiza su entrada cuando tengas un original nuevo. El generador admite imágenes nuevas aunque todavía no tengan ficha.

## Cambios de funcionamiento

- El HTML publicado contiene estilo, código y catálogo en una sola respuesta. Las imágenes se sirven desde el mismo GitHub Pages.
- Una imagen que no responde tiene tiempo límite y reintento. Las otras pueden aparecer mientras termina la carga; si falla todo, se muestra un botón para reintentar.
- Los cambios de ancho conservan las imágenes cargadas y la posición relativa del movimiento. Si el marco se oculta o queda con ancho cero, el ciclo se recupera al reaparecer, incluso si vuelve al mismo tamaño.
- El carrusel ocupa todo el marco, sin reservar una franja para controles. El ciclo utiliza dos grupos idénticos y un desplazamiento porcentual para evitar desfases al cambiar de tamaño.
- Cada logo ocupa su ancho real, sin cajas vacías a los lados. La separación predeterminada es de 12 px, como los dos márgenes de 6 px del carrusel original; los enlaces con una separación explícita conservan ese valor.
- En teléfono se limita el ancho máximo de cada logo al espacio de dos o tres columnas, pero los logos pequeños no se estiran ni reservan toda la columna. El ciclo se repite lo necesario para que nunca quede un tramo vacío.
- No hay botón de pausa ni pausa al pasar el cursor, tocar, hacer clic o enfocar. Solo se suspende el trabajo cuando la pestaña está oculta o el marco no tiene espacio.
- Se respeta la preferencia de accesibilidad de movimiento reducido del dispositivo: en ese caso los logos siguen visibles y se pueden desplazar manualmente.
- Una imagen con evento de carga y dimensiones válidas no espera a `decode()`, que puede aplazarse en marcos ocultos.
- Los enlaces utilizan la dirección de la publicación que estés visitando.

## Comprobaciones

~~~sh
python3 scripts/build.py
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
~~~

Las comprobaciones cubren conexiones fallidas, respuestas atascadas, reintentos, cancelación, distintos anchos, coincidencia de archivos publicados, cambios en el catálogo y nombres accesibles. La revisión visual en el Google Sites real se realiza después de publicar; no equivale a las comprobaciones de código.

La [prueba de tamaño](tests/resize-preview.html) permite pasar de computadora a 390, 320 o 240 px, ocultar el marco y volver a mostrarlo, o empezar la carga oculto. Muestra los logos cargados y el estado del movimiento sin modificar el catálogo. Es una página de comprobación separada: sus controles no se insertan en Google Sites.

El resultado público se genera en dist/. El workflow .github/workflows/update-manifest.yml utiliza las acciones oficiales de Pages. Si una comprobación falla, no se ejecuta una nueva publicación.

## Privacidad de las imágenes

Antes de esta entrega se retiraron los metadatos EXIF y de texto de los PNG que los contenían, con autorización del usuario. No se cambiaron los píxeles, la transparencia, las dimensiones ni los perfiles de color. La procedencia y los créditos se conservan en LOGOS.md y en la ficha pública de los logos.

El script local `node scripts/sanitize-metadata.cjs --check` permite revisar los PNG sin mostrar el contenido de sus metadatos. `--write` retira esos datos antes de subir los archivos. Esta limpieza no mejora la resolución de un logo ni elimina información de archivos que se hayan publicado anteriormente.

## Procedencia

Adaptado del [repositorio original de Mantua](https://github.com/MANTUA-DECORACION/CARRUSEL-LOGOS/tree/b4575d2476fd29026c6e6d4f4cc8d4da25407fe1).

[Publicación mediante GitHub Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
