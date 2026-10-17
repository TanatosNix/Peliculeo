import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore, collection, deleteDoc, doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const STORAGE_KEY = "mi-cine.movies.v1";
const SETTINGS_KEY = "mi-cine.settings.v1";
const MOVIES_COLLECTION = "movies";
const GLOBAL_TMDB_KEY = window.PELICULEO_CONFIG?.tmdbApiKey?.trim() || "";
const FIREBASE_CONFIG = window.PELICULEO_CONFIG?.firebase || null;
const CATEGORY_ORDER = ["favorite", "enjoyable", "good", "passable", "meh", "bad", "terrible", "standard"];

const sampleMovies = [
  {
    id: crypto.randomUUID(),
    title: "El viaje de Chihiro",
    genres: ["Animacion", "Fantasia"],
    status: "watched",
    category: "favorite",
    rating: 5,
    cover: "https://upload.wikimedia.org/wikipedia/en/d/db/Spirited_Away_Japanese_poster.png",
    synopsis:
      "Chihiro entra en un mundo fantastico donde debera encontrar valor, amigos y una forma de salvar a sus padres.",
    source: "Ejemplo",
    createdAt: Date.now()
  },
  {
    id: crypto.randomUUID(),
    title: "Interestelar",
    genres: ["Ciencia ficcion", "Drama"],
    status: "watchlist",
    category: "standard",
    rating: 0,
    cover: "https://upload.wikimedia.org/wikipedia/en/b/bc/Interstellar_film_poster.jpg",
    synopsis:
      "Un grupo de exploradores viaja mas alla de nuestra galaxia para buscar un futuro posible para la humanidad.",
    source: "Ejemplo",
    createdAt: Date.now()
  }
];

const localBootstrap = loadLocalMovies();

let movies = [...localBootstrap];
let settings = loadSettings();
let uploadedCover = "";
let activeDetailMovieId = "";
let currentRating = 0;
let lookupChoices = new Map();
let filters = {
  search: "",
  status: "all",
  genre: "all",
  category: "all"
};

const syncState = {
  mode: "local",
  db: null,
  unsubscribe: null,
  migrating: false
};

const elements = {
  grid: document.querySelector("#movieGrid"),
  empty: document.querySelector("#emptyState"),
  filtersPanel: document.querySelector("#filtersPanel"),
  filtersBackdrop: document.querySelector("#filtersBackdrop"),
  search: document.querySelector("#searchInput"),
  searchGenreFilter: document.querySelector("#searchGenreFilter"),
  searchStatusFilter: document.querySelector("#searchStatusFilter"),
  catalog: document.querySelector("#catalogo"),
  statusFilter: document.querySelector("#statusFilter"),
  genreFilter: document.querySelector("#genreFilter"),
  categoryFilter: document.querySelector("#categoryFilter"),
  quickFilters: document.querySelectorAll("[data-category-filter]"),
  totalCount: document.querySelector("#totalCount"),
  watchlistCount: document.querySelector("#watchlistCount"),
  watchedCount: document.querySelector("#watchedCount"),
  favoriteCount: document.querySelector("#favoriteCount"),
  terribleCount: document.querySelector("#terribleCount"),
  movieModal: document.querySelector("#movieModal"),
  detailModal: document.querySelector("#detailModal"),
  movieForm: document.querySelector("#movieForm"),
  settingsForm: document.querySelector("#settingsForm"),
  modalTitle: document.querySelector("#modalTitle"),
  movieId: document.querySelector("#movieId"),
  title: document.querySelector("#titleInput"),
  genres: document.querySelector("#genresInput"),
  status: document.querySelector("#movieStatusInput"),
  category: document.querySelector("#movieCategoryInput"),
  cover: document.querySelector("#coverInput"),
  coverFile: document.querySelector("#coverFileInput"),
  coverPreviewImage: document.querySelector("#coverPreviewImage"),
  coverPreviewText: document.querySelector("#coverPreviewText"),
  synopsis: document.querySelector("#synopsisInput"),
  lookupResults: document.querySelector("#lookupResults"),
  lookupNote: document.querySelector("#lookupNote"),
  deleteButton: document.querySelector("#deleteButton"),
  ratingOptions: document.querySelector("#ratingOptions"),
  ratingFill: document.querySelector("#ratingFill"),
  ratingReadout: document.querySelector("#ratingReadout"),
  tmdbKey: document.querySelector("#tmdbKeyInput"),
  syncStatus: document.querySelector("#syncStatus"),
  detailPosterWrap: document.querySelector("#detailPosterWrap"),
  detailCategory: document.querySelector("#detailCategory"),
  detailTitle: document.querySelector("#detailTitle"),
  detailMeta: document.querySelector("#detailMeta"),
  detailRating: document.querySelector("#detailRating"),
  detailSynopsis: document.querySelector("#detailSynopsis"),
  detailBadges: document.querySelector("#detailBadges"),
  detailMarkWatchedButton: document.querySelector("#detailMarkWatchedButton")
};

buildRatingOptions();
bindEvents();
render();
registerServiceWorker();
void initializeCatalog();

async function initializeCatalog() {
  setSyncStatus("Catalogo guardado en este dispositivo.", "local");
  await setupCloudSync();
  render();
}

function loadLocalMovies() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleMovies));
    return sampleMovies;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLocalMovies(moviesToSave = movies) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(moviesToSave));
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { tmdbKey: "" };
  } catch {
    return { tmdbKey: "" };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

async function setupCloudSync() {
  if (!FIREBASE_CONFIG?.apiKey || !FIREBASE_CONFIG?.projectId || !FIREBASE_CONFIG?.appId) {
    setSyncStatus("Sin configuracion de nube. La app sigue funcionando en este dispositivo.", "warning");
    return;
  }

  try {
    const app = initializeApp(FIREBASE_CONFIG);
    const db = getFirestore(app);
    syncState.db = db;
    syncState.mode = "cloud";
    setSyncStatus("Conectando con tu catalogo compartido...", "progress");

    let firstSnapshotHandled = false;
    syncState.unsubscribe = onSnapshot(
      collection(db, MOVIES_COLLECTION),
      async (snapshot) => {
        try {
          const remoteMovies = snapshot.docs.map((item) => normalizeMovie({ id: item.id, ...item.data() }));

          if (!firstSnapshotHandled) {
            firstSnapshotHandled = true;
            if (snapshot.empty && localBootstrap.length) {
              syncState.migrating = true;
              setSyncStatus("Subiendo el catalogo a la nube por primera vez...", "progress");
              await migrateLocalMovies(localBootstrap);
              return;
            }
          }

          syncState.migrating = false;
          movies = remoteMovies;
          saveLocalMovies(remoteMovies);
          render();
          refreshActiveDetail();
          setSyncStatus("Sincronizado entre tus dispositivos.", "cloud");
        } catch (error) {
          console.error(error);
          fallbackToLocal("No pude terminar la sincronizacion. La app sigue usando la copia local.");
        }
      },
      (error) => {
        console.error(error);
        fallbackToLocal("No pude conectar con la nube. La app sigue usando este dispositivo.");
      }
    );
  } catch (error) {
    console.error(error);
    fallbackToLocal("Firebase no se pudo iniciar. La app sigue funcionando en local.");
  }
}

async function migrateLocalMovies(moviesToMigrate) {
  await Promise.all(
    moviesToMigrate.map((movie) => setDoc(doc(syncState.db, MOVIES_COLLECTION, movie.id), serializeMovie(movie)))
  );
}

function fallbackToLocal(message) {
  syncState.mode = "local";
  syncState.db = null;
  movies = [...loadLocalMovies()];
  render();
  refreshActiveDetail();
  setSyncStatus(message, "warning");
}

async function persistMovie(movie) {
  const normalized = normalizeMovie(movie);
  if (syncState.mode !== "cloud" || !syncState.db) {
    const existing = movies.find((item) => item.id === normalized.id);
    movies = existing ? movies.map((item) => (item.id === normalized.id ? normalized : item)) : [normalized, ...movies];
    saveLocalMovies();
    render();
    refreshActiveDetail();
    return normalized;
  }

  await setDoc(doc(syncState.db, MOVIES_COLLECTION, normalized.id), serializeMovie(normalized));
  return normalized;
}

async function removeMovieById(id) {
  if (syncState.mode !== "cloud" || !syncState.db) {
    movies = movies.filter((movie) => movie.id !== id);
    saveLocalMovies();
    render();
    refreshActiveDetail();
    return;
  }

  await deleteDoc(doc(syncState.db, MOVIES_COLLECTION, id));
}

function normalizeMovie(movie) {
  return {
    id: movie.id || crypto.randomUUID(),
    title: movie.title?.trim() || "Sin titulo",
    genres: Array.isArray(movie.genres) ? movie.genres.filter(Boolean) : [],
    status: movie.status === "watched" ? "watched" : "watchlist",
    category: normalizeCategory(movie.category),
    rating: clampRating(movie.rating),
    cover: movie.cover?.trim() || "",
    synopsis: movie.synopsis?.trim() || "",
    source: movie.source?.trim() || "",
    createdAt: Number(movie.createdAt) || Date.now()
  };
}

function serializeMovie(movie) {
  const normalized = normalizeMovie(movie);
  return {
    title: normalized.title,
    genres: normalized.genres,
    status: normalized.status,
    category: normalized.category,
    rating: normalized.rating,
    cover: normalized.cover,
    synopsis: normalized.synopsis,
    source: normalized.source,
    createdAt: normalized.createdAt
  };
}

function getTmdbKey() {
  return GLOBAL_TMDB_KEY || settings.tmdbKey || "";
}

function bindEvents() {
  document.querySelector("#openAddButton").addEventListener("click", () => openMovieModal());
  document.querySelector("#heroAddButton").addEventListener("click", () => openMovieModal());
  document.querySelector("#emptyAddButton").addEventListener("click", () => openMovieModal());
  document.querySelector("#openMenuBrand").addEventListener("click", openFiltersPanel);
  document.querySelector("#closeFiltersButton").addEventListener("click", closeFiltersPanel);
  elements.filtersBackdrop.addEventListener("click", closeFiltersPanel);
  document.querySelector("#closeMovieModal").addEventListener("click", () => elements.movieModal.close());
  document.querySelector("#closeDetailModal").addEventListener("click", () => elements.detailModal.close());
  document.querySelector("#lookupButton").addEventListener("click", () => void lookupMovie());
  elements.title.addEventListener("keydown", handleTitleLookupKeydown);
  elements.lookupResults.addEventListener("click", (event) => void chooseLookupResult(event));
  document.querySelector("#editFromDetailButton").addEventListener("click", editActiveDetailMovie);
  elements.detailMarkWatchedButton.addEventListener("click", () => void toggleActiveDetailStatus());

  elements.cover.addEventListener("input", () => {
    uploadedCover = "";
    updateCoverPreview(elements.cover.value.trim());
  });

  elements.coverFile.addEventListener("change", (event) => void handleCoverFile(event));
  elements.ratingOptions.addEventListener("pointermove", previewRatingFromPointer);
  elements.ratingOptions.addEventListener("pointerleave", () => renderRating(currentRating));
  elements.ratingOptions.addEventListener("click", selectRatingFromPointer);
  elements.ratingOptions.addEventListener("keydown", handleRatingKeyboard);

  elements.search.addEventListener("input", (event) => {
    filters.search = event.target.value.trim().toLowerCase();
    render();
  });

  elements.statusFilter.addEventListener("change", (event) => {
    setStatusFilter(event.target.value);
    revealCatalogFromFilters();
  });

  elements.searchStatusFilter.addEventListener("change", (event) => {
    setStatusFilter(event.target.value);
  });

  elements.genreFilter.addEventListener("change", (event) => {
    setGenreFilter(event.target.value);
    revealCatalogFromFilters();
  });

  elements.searchGenreFilter.addEventListener("change", (event) => {
    setGenreFilter(event.target.value);
  });

  elements.categoryFilter.addEventListener("change", (event) => {
    setCategoryFilter(event.target.value);
    revealCatalogFromFilters();
  });

  for (const button of elements.quickFilters) {
    button.addEventListener("click", () => setCategoryFilter(button.dataset.categoryFilter));
  }

  elements.movieForm.addEventListener("submit", (event) => void saveMovieFromForm(event));
  elements.settingsForm.addEventListener("submit", saveSettingsFromForm);
  elements.deleteButton.addEventListener("click", () => void deleteCurrentMovie());
}

function buildRatingOptions() {
  renderRating(0);
}

function render() {
  renderStats();
  renderGenreFilter();
  renderGrid();
}

function renderStats() {
  elements.totalCount.textContent = movies.length;
  elements.watchlistCount.textContent = movies.filter((movie) => movie.status === "watchlist").length;
  elements.watchedCount.textContent = movies.filter((movie) => movie.status === "watched").length;
  elements.favoriteCount.textContent = movies.filter((movie) => getMovieCategory(movie) === "favorite").length;
  elements.terribleCount.textContent = movies.filter((movie) => getMovieCategory(movie) === "terrible").length;
}

function renderGenreFilter() {
  const genres = [...new Set(movies.flatMap((movie) => movie.genres))].sort((a, b) => a.localeCompare(b));
  const current = filters.genre;
  const selectors = [elements.genreFilter, elements.searchGenreFilter];

  for (const selector of selectors) {
    selector.innerHTML = '<option value="all">Todos</option>';
  }

  for (const genre of genres) {
    for (const selector of selectors) {
      const option = document.createElement("option");
      option.value = genre;
      option.textContent = genre;
      selector.append(option);
    }
  }

  filters.genre = genres.includes(current) ? current : "all";
  for (const selector of selectors) {
    selector.value = filters.genre;
  }
}

function renderGrid() {
  const visibleMovies = movies
    .filter(matchesFilters)
    .sort((a, b) => {
      const categoryDelta = categoryWeight(a.category) - categoryWeight(b.category);
      if (categoryDelta !== 0) return categoryDelta;
      return b.createdAt - a.createdAt;
    });

  elements.grid.innerHTML = "";
  elements.empty.hidden = visibleMovies.length > 0;

  for (const movie of visibleMovies) {
    elements.grid.append(createMovieCard(movie));
  }
}

function matchesFilters(movie) {
  const haystack = [movie.title, movie.synopsis, ...movie.genres].join(" ").toLowerCase();
  const searchMatch = !filters.search || haystack.includes(filters.search);
  const statusMatch = filters.status === "all" || movie.status === filters.status;
  const genreMatch = filters.genre === "all" || movie.genres.includes(filters.genre);
  const categoryMatch = filters.category === "all" || getMovieCategory(movie) === filters.category;
  return searchMatch && statusMatch && genreMatch && categoryMatch;
}

function createMovieCard(movie) {
  const card = document.createElement("article");
  card.className = "movie-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Abrir ficha de ${movie.title}`);

  const poster = movie.cover
    ? `<img class="poster" src="${escapeAttribute(movie.cover)}" alt="Caratula de ${escapeAttribute(movie.title)}" loading="lazy" />`
    : `<div class="poster-fallback">${escapeHtml(movie.title)}</div>`;
  const category = getMovieCategory(movie);

  card.innerHTML = `
    ${poster}
    <span class="card-category ${category}">${categoryLabel(category)}</span>
    <div class="movie-info">
      <h3 class="movie-title">${escapeHtml(movie.title)}</h3>
      <div class="movie-meta">${escapeHtml(movie.genres.join(" · ") || "Sin genero")}</div>
      <div class="badge-row">
        <span class="badge ${movie.status === "watched" ? "ok" : "pending"}">
          ${movie.status === "watched" ? "Vista" : "Por ver"}
        </span>
        ${category !== "standard" ? `<span class="badge ${category}">${categoryLabel(category)}</span>` : ""}
        ${movie.source ? `<span class="badge">${escapeHtml(movie.source)}</span>` : ""}
      </div>
      <div class="rating" aria-label="Valoracion ${movie.rating || 0} de 5">
        ${ratingDisplay(movie.rating)}
      </div>
      <p class="movie-synopsis">${escapeHtml(movie.synopsis || "Sin sinopsis todavia.")}</p>
    </div>
  `;

  card.addEventListener("click", () => openDetailModal(movie));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetailModal(movie);
    }
  });
  return card;
}

function openDetailModal(movie) {
  activeDetailMovieId = movie.id;
  const category = getMovieCategory(movie);
  const poster = movie.cover
    ? `<img class="detail-poster" src="${escapeAttribute(movie.cover)}" alt="Caratula de ${escapeAttribute(movie.title)}" />`
    : `<div class="detail-poster poster-fallback">${escapeHtml(movie.title)}</div>`;

  elements.detailPosterWrap.innerHTML = poster;
  elements.detailCategory.textContent = categoryLabel(category);
  elements.detailTitle.textContent = movie.title;
  elements.detailMeta.textContent = movie.genres.join(" · ") || "Sin genero";
  elements.detailRating.textContent = ratingDisplay(movie.rating);
  elements.detailSynopsis.textContent = movie.synopsis || "Sin sinopsis todavia.";
  elements.detailBadges.innerHTML = `
    <span class="badge ${movie.status === "watched" ? "ok" : "pending"}">${movie.status === "watched" ? "Vista" : "Por ver"}</span>
    <span class="badge ${category}">${categoryLabel(category)}</span>
    ${movie.source ? `<span class="badge">${escapeHtml(movie.source)}</span>` : ""}
  `;
  elements.detailMarkWatchedButton.textContent = movie.status === "watched" ? "Marcar por ver" : "Marcar vista";
  if (!elements.detailModal.open) {
    elements.detailModal.showModal();
  }
}

function refreshActiveDetail() {
  if (!elements.detailModal.open || !activeDetailMovieId) return;
  const movie = movies.find((item) => item.id === activeDetailMovieId);
  if (!movie) {
    elements.detailModal.close();
    return;
  }
  openDetailModal(movie);
}

function openMovieModal(movie = null) {
  elements.movieForm.reset();
  elements.lookupNote.textContent = "";
  clearLookupResults();
  uploadedCover = "";
  updateCoverPreview("");

  if (movie) {
    elements.modalTitle.textContent = "Editar pelicula";
    elements.movieId.value = movie.id;
    elements.title.value = movie.title;
    elements.genres.value = movie.genres.join(", ");
    elements.status.value = movie.status;
    elements.category.value = getMovieCategory(movie);
    uploadedCover = movie.cover?.startsWith("data:image/") ? movie.cover : "";
    elements.cover.value = uploadedCover ? "Imagen guardada en la app" : movie.cover || "";
    updateCoverPreview(movie.cover || "");
    elements.synopsis.value = movie.synopsis || "";
    elements.deleteButton.hidden = false;
    setRating(movie.rating || 0);
  } else {
    elements.modalTitle.textContent = "Anadir pelicula";
    elements.movieId.value = "";
    elements.deleteButton.hidden = true;
    setRating(0);
  }

  elements.movieModal.showModal();
  elements.title.focus();
}

function setRating(value) {
  currentRating = clampRating(value);
  renderRating(currentRating);
}

function getSelectedRating() {
  return currentRating;
}

async function saveMovieFromForm(event) {
  event.preventDefault();

  const id = elements.movieId.value || crypto.randomUUID();
  const existing = movies.find((movie) => movie.id === id);
  const movie = normalizeMovie({
    id,
    title: elements.title.value.trim(),
    genres: normalizeGenres(elements.genres.value),
    status: elements.status.value,
    category: elements.category.value,
    rating: getSelectedRating(),
    cover: uploadedCover || elements.cover.value.trim(),
    synopsis: elements.synopsis.value.trim(),
    source: existing?.source || "",
    createdAt: existing?.createdAt || Date.now()
  });

  const previousMovies = [...movies];
  const nextMovies = existing ? movies.map((item) => (item.id === id ? movie : item)) : [movie, ...movies];

  try {
    movies = nextMovies;
    saveLocalMovies(nextMovies);
    render();
    await persistMovie(movie);
    elements.movieModal.close();
    const updatedMovie = movies.find((movieItem) => movieItem.id === id);
    if (activeDetailMovieId === id && updatedMovie) {
      openDetailModal(updatedMovie);
    }
    elements.lookupNote.textContent = "";
  } catch (error) {
    console.error(error);
    movies = previousMovies;
    saveLocalMovies(previousMovies);
    render();
    elements.lookupNote.textContent = "No pude guardar la pelicula en la nube. Intentalo de nuevo.";
  }
}

function saveSettingsFromForm(event) {
  event.preventDefault();
  if (GLOBAL_TMDB_KEY) {
    elements.tmdbKey.blur();
    return;
  }

  settings = {
    ...settings,
    tmdbKey: elements.tmdbKey.value.trim()
  };
  saveSettings();
  elements.tmdbKey.blur();
}

async function deleteCurrentMovie() {
  const id = elements.movieId.value;
  if (!id) return;
  const confirmed = confirm("Eliminar esta pelicula del catalogo?");
  if (!confirmed) return;

  const previousMovies = [...movies];

  try {
    movies = movies.filter((movie) => movie.id !== id);
    saveLocalMovies();
    render();
    await removeMovieById(id);
    elements.movieModal.close();
    if (elements.detailModal.open) elements.detailModal.close();
  } catch (error) {
    console.error(error);
    movies = previousMovies;
    saveLocalMovies(previousMovies);
    render();
    elements.lookupNote.textContent = "No pude eliminar la pelicula en este momento.";
  }
}

function editActiveDetailMovie() {
  const movie = movies.find((item) => item.id === activeDetailMovieId);
  if (!movie) return;
  elements.detailModal.close();
  openMovieModal(movie);
}

async function toggleActiveDetailStatus() {
  const movie = movies.find((item) => item.id === activeDetailMovieId);
  if (!movie) return;

  const updatedMovie = normalizeMovie({
    ...movie,
    status: movie.status === "watched" ? "watchlist" : "watched"
  });

  const previousMovies = [...movies];

  try {
    movies = movies.map((item) => (item.id === updatedMovie.id ? updatedMovie : item));
    saveLocalMovies();
    render();
    openDetailModal(updatedMovie);
    await persistMovie(updatedMovie);
  } catch (error) {
    console.error(error);
    movies = previousMovies;
    saveLocalMovies(previousMovies);
    render();
    openDetailModal(movie);
  }
}

async function lookupMovie() {
  const title = elements.title.value.trim();
  clearLookupResults();
  if (!title) {
    elements.lookupNote.textContent = "Escribe un titulo o un codigo IMDb para buscar.";
    return;
  }

  elements.lookupNote.textContent = "Buscando datos en internet...";

  try {
    const result = getTmdbKey() ? await lookupTmdb(title) : await lookupWikipedia(title);
    if (!result) {
      elements.lookupNote.textContent = "No encontre una coincidencia clara. Puedes completar la ficha a mano.";
      return;
    }

    if (result.choices?.length) {
      renderLookupResults(result.choices);
      elements.lookupNote.textContent = "He encontrado varias coincidencias. Elige la pelicula exacta.";
      return;
    }

    applyLookupResult(result, title);
  } catch (error) {
    elements.lookupNote.textContent = "No pude conectar con la fuente online. Prueba mas tarde o completa la ficha a mano.";
    console.error(error);
  }
}

function handleTitleLookupKeydown(event) {
  if (event.key !== "Enter" || event.isComposing) return;

  event.preventDefault();
  void lookupMovie();
}

async function lookupWikipedia(title) {
  const searchUrl = new URL("https://es.wikipedia.org/w/api.php");
  searchUrl.search = new URLSearchParams({
    action: "opensearch",
    search: `${title} pelicula`,
    limit: "1",
    namespace: "0",
    format: "json",
    origin: "*"
  });

  const searchResponse = await fetch(searchUrl);
  const searchData = await searchResponse.json();
  const pageTitle = searchData?.[1]?.[0] || title;

  const summaryUrl = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`;
  const summaryResponse = await fetch(summaryUrl);
  if (!summaryResponse.ok) return null;

  const summary = await summaryResponse.json();
  return {
    title: summary.title,
    cover: summary.thumbnail?.source || "",
    synopsis: summary.extract || "",
    genres: [],
    source: "Wikipedia"
  };
}

async function lookupTmdb(title) {
  const imdbId = normalizeImdbId(title);
  if (imdbId) {
    const findUrl = new URL(`https://api.themoviedb.org/3/find/${imdbId}`);
    findUrl.search = new URLSearchParams({
      api_key: getTmdbKey(),
      language: "es-ES",
      external_source: "imdb_id"
    });

    const findResponse = await fetch(findUrl);
    const findData = await findResponse.json();
    const match = findData.movie_results?.[0];
    return match ? lookupTmdbDetails(match.id, formatTmdbChoice(match)) : null;
  }

  const searchUrl = new URL("https://api.themoviedb.org/3/search/movie");
  searchUrl.search = new URLSearchParams({
    api_key: getTmdbKey(),
    query: title,
    language: "es-ES",
    include_adult: "false"
  });

  const searchResponse = await fetch(searchUrl);
  const searchData = await searchResponse.json();
  const results = (searchData.results || []).filter((movie) => movie.title || movie.original_title).slice(0, 8);
  if (!results.length) return null;
  if (results.length > 1) {
    return { choices: results.map(formatTmdbChoice) };
  }

  return lookupTmdbDetails(results[0].id, formatTmdbChoice(results[0]));
}

async function lookupTmdbDetails(tmdbId, fallback = {}) {
  const detailsUrl = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  detailsUrl.search = new URLSearchParams({
    api_key: getTmdbKey(),
    language: "es-ES"
  });

  const detailsResponse = await fetch(detailsUrl);
  const details = await detailsResponse.json();

  return {
    title: details.title || details.original_title || fallback.title || "",
    cover: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : "",
    synopsis: details.overview || fallback.synopsis || "",
    genres: details.genres?.map((genre) => genre.name) || [],
    source: "TMDB"
  };
}

function formatTmdbChoice(movie) {
  return {
    id: String(movie.id),
    title: movie.title || movie.original_title || "Sin titulo",
    originalTitle: movie.original_title || "",
    year: movie.release_date ? movie.release_date.slice(0, 4) : "",
    synopsis: movie.overview || "",
    cover: movie.poster_path ? `https://image.tmdb.org/t/p/w185${movie.poster_path}` : ""
  };
}

function renderLookupResults(choices) {
  lookupChoices = new Map(choices.map((movie) => [movie.id, movie]));
  elements.lookupResults.hidden = false;
  elements.lookupResults.innerHTML = choices
    .map((movie) => {
      const alternateTitle = movie.originalTitle && movie.originalTitle !== movie.title ? movie.originalTitle : "";
      const meta = [movie.year || "Ano desconocido", alternateTitle].filter(Boolean).join(" · ");
      const poster = movie.cover
        ? `<img src="${escapeAttribute(movie.cover)}" alt="Cartel de ${escapeAttribute(movie.title)}" loading="lazy" />`
        : `<span class="lookup-poster-fallback" aria-hidden="true"></span>`;

      return `
        <button class="lookup-result" type="button" data-tmdb-id="${escapeAttribute(movie.id)}">
          ${poster}
          <span>
            <strong>${escapeHtml(movie.title)}</strong>
            <small>${escapeHtml(meta)}</small>
            ${movie.synopsis ? `<em>${escapeHtml(movie.synopsis)}</em>` : ""}
          </span>
        </button>
      `;
    })
    .join("");
}

async function chooseLookupResult(event) {
  const button = event.target.closest("[data-tmdb-id]");
  if (!button) return;

  elements.lookupNote.textContent = "Cargando esa pelicula...";
  try {
    const result = await lookupTmdbDetails(button.dataset.tmdbId, lookupChoices.get(button.dataset.tmdbId));
    clearLookupResults();
    applyLookupResult(result, elements.title.value.trim());
  } catch (error) {
    elements.lookupNote.textContent = "No pude cargar esa opcion. Prueba con otra.";
    console.error(error);
  }
}

function applyLookupResult(result, fallbackTitle) {
  elements.title.value = result.title || fallbackTitle;
  if (result.cover) {
    uploadedCover = "";
    elements.cover.value = result.cover;
    updateCoverPreview(result.cover);
  }
  elements.synopsis.value = result.synopsis || elements.synopsis.value;
  elements.genres.value = result.genres?.length ? result.genres.join(", ") : elements.genres.value;
  elements.lookupNote.textContent = `Datos encontrados con ${result.source}. Revisa la ficha antes de guardar.`;
}

function clearLookupResults() {
  lookupChoices.clear();
  elements.lookupResults.hidden = true;
  elements.lookupResults.innerHTML = "";
}

function normalizeImdbId(value) {
  const match = value.trim().match(/\btt\d{7,9}\b/i);
  return match ? match[0].toLowerCase() : "";
}

function normalizeGenres(value) {
  return value
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean)
    .map((genre) => genre.charAt(0).toUpperCase() + genre.slice(1));
}

function setGenreFilter(genre) {
  filters.genre = genre;
  elements.genreFilter.value = genre;
  elements.searchGenreFilter.value = genre;
  render();
}

function setStatusFilter(status) {
  filters.status = status;
  elements.statusFilter.value = status;
  elements.searchStatusFilter.value = status;
  render();
}

function setCategoryFilter(category) {
  filters.category = category;
  elements.categoryFilter.value = category;
  for (const button of elements.quickFilters) {
    button.classList.toggle("active", button.dataset.categoryFilter === category);
  }
  render();
}

function openFiltersPanel() {
  elements.tmdbKey.value = GLOBAL_TMDB_KEY ? "Configurada globalmente" : settings.tmdbKey || "";
  elements.tmdbKey.disabled = Boolean(GLOBAL_TMDB_KEY);
  elements.filtersPanel.classList.add("open");
  document.body.classList.add("filters-open");
  elements.filtersPanel.setAttribute("aria-hidden", "false");
  elements.filtersBackdrop.hidden = false;
}

function closeFiltersPanel() {
  elements.filtersPanel.classList.remove("open");
  document.body.classList.remove("filters-open");
  elements.filtersPanel.setAttribute("aria-hidden", "true");
  elements.filtersBackdrop.hidden = true;
}

function revealCatalogFromFilters() {
  closeFiltersPanel();
  requestAnimationFrame(() => {
    elements.catalog?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function setSyncStatus(message, state = "local") {
  if (!elements.syncStatus) return;
  elements.syncStatus.textContent = message;
  elements.syncStatus.dataset.state = state;
}

function getMovieCategory(movie) {
  return normalizeCategory(movie.category);
}

function categoryLabel(category) {
  const labels = {
    favorite: "Favorita",
    enjoyable: "Disfrutable",
    good: "Buena",
    passable: "Pasable",
    meh: "Meh",
    bad: "Mala",
    terrible: "Terrible",
    standard: "Sin categoria"
  };
  return labels[category] || labels.standard;
}

function normalizeCategory(category) {
  return CATEGORY_ORDER.includes(category) ? category : "standard";
}

function categoryWeight(category) {
  const normalized = normalizeCategory(category);
  const index = CATEGORY_ORDER.indexOf(normalized);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function stars(value) {
  const rating = clampRating(value);
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(5 - full - (half ? 1 : 0));
}

function ratingDisplay(value) {
  const rating = clampRating(value);
  return rating ? `${stars(rating)} ${formatRating(rating)}` : "Sin nota";
}

function previewRatingFromPointer(event) {
  renderRating(getRatingFromPointer(event), false);
}

function selectRatingFromPointer(event) {
  setRating(getRatingFromPointer(event));
}

function getRatingFromPointer(event) {
  const rect = elements.ratingOptions.getBoundingClientRect();
  const position = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
  return clampRating(Math.ceil((position / rect.width) * 10) / 2);
}

function handleRatingKeyboard(event) {
  if (!["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp", "Home", "End", "Backspace", "Delete"].includes(event.key)) {
    return;
  }

  event.preventDefault();

  if (event.key === "Home" || event.key === "Backspace" || event.key === "Delete") {
    setRating(0);
    return;
  }

  if (event.key === "End") {
    setRating(5);
    return;
  }

  const delta = event.key === "ArrowRight" || event.key === "ArrowUp" ? 0.5 : -0.5;
  setRating(currentRating + delta);
}

function renderRating(value, persist = true) {
  const rating = clampRating(value);
  const percent = (rating / 5) * 100;
  elements.ratingFill.style.width = `${percent}%`;
  elements.ratingOptions.setAttribute("aria-valuenow", String(rating));
  elements.ratingOptions.setAttribute("aria-valuetext", rating ? `${formatRating(rating)} de 5` : "Sin nota");
  elements.ratingReadout.textContent = rating ? `${formatRating(rating)} de 5` : "Sin nota";

  if (persist) {
    currentRating = rating;
  }
}

function clampRating(value) {
  const numeric = Number(value) || 0;
  return Math.min(5, Math.max(0, Math.round(numeric * 2) / 2));
}

function formatRating(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

async function handleCoverFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    elements.lookupNote.textContent = "El archivo elegido no parece una imagen.";
    return;
  }

  try {
    uploadedCover = await resizeImage(file, 900, 1350);
    elements.cover.value = `Imagen subida: ${file.name}`;
    updateCoverPreview(uploadedCover);
    elements.lookupNote.textContent = "Caratula cargada desde tu dispositivo.";
  } catch (error) {
    elements.lookupNote.textContent = "No pude cargar esa imagen. Prueba con otra.";
    console.error(error);
  }
}

function updateCoverPreview(src) {
  const cleanSrc = src?.trim();

  if (!cleanSrc || cleanSrc.startsWith("Imagen subida:") || cleanSrc === "Imagen guardada en la app") {
    elements.coverPreviewImage.hidden = true;
    elements.coverPreviewImage.removeAttribute("src");
    elements.coverPreviewText.textContent = "Sin caratula seleccionada";
    return;
  }

  elements.coverPreviewImage.hidden = false;
  elements.coverPreviewImage.src = cleanSrc;
  elements.coverPreviewText.textContent = "Vista previa";
}

function resizeImage(file, maxWidth, maxHeight) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        const width = Math.round(image.width * ratio);
        const height = Math.round(image.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    let reloading = false;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => {
        registration.update().catch(() => {});

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              window.location.reload();
            }
          });
        });
      })
      .catch((error) => console.warn("SW registration failed", error));
  }
}
