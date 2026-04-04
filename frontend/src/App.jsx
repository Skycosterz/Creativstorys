import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { useAvatarGeneration } from './hooks/useAvatarGeneration';

import { API_BASE_URL as API_BASE, resolveAssetUrl } from './config';


const STATUS_LABELS = {
  in_progress: 'En curso',
  paused: 'Pausada',
  completed: 'Terminada',
  archived: 'Archivada',
};

const STATUS_FILTERS = [
  { value: 'all', label: 'Todas' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'paused', label: 'Pausadas' },
  { value: 'completed', label: 'Terminadas' },
];

function formatRelativeTime(dateValue) {
  if (!dateValue) return 'sin actividad';
  const now = Date.now();
  const target = new Date(dateValue).getTime();
  if (Number.isNaN(target)) return 'sin actividad';
  const diffMs = Math.max(now - target, 0);
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'hace un momento';
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `hace ${diffDays} d`;
}

function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

function normalizeStory(raw) {
  return {
    ...raw,
    synopsis: raw.synopsis || '',
    status: raw.status || 'in_progress',
    messageCount: typeof raw.messageCount === 'number' ? raw.messageCount : 0,
    lastActivityAt: raw.lastActivityAt || raw.createdAt || null,
  };
}

function App() {
  const [activeView, setActiveView] = useState('home'); // 'home' | 'studio' | 'series' | 'reader'
  const [viewedSeriesId, setViewedSeriesId] = useState(null);
  const [viewedEpisodeId, setViewedEpisodeId] = useState(null);
  const [homeFeed, setHomeFeed] = useState([]);
  const [seriesData, setSeriesData] = useState(null);
  const [readerData, setReaderData] = useState(null);


  const [activeTab, setActiveTab] = useState('stories');
  const [characters, setCharacters] = useState([]);
  const [stories, setStories] = useState([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [selectedStoryId, setSelectedStoryId] = useState('');
  const [storyLog, setStoryLog] = useState([]);
  const [worldState, setWorldState] = useState({});
  const [storyTitle, setStoryTitle] = useState('');
  const [newCharacterName, setNewCharacterName] = useState('');
  const [newCharacterDescription, setNewCharacterDescription] = useState('');
  const [genre, setGenre] = useState('fantasia');
  const [scenario, setScenario] = useState('Bosque oscuro');
  const [input, setInput] = useState('');
  const [showCreateStory, setShowCreateStory] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingStory, setEditingStory] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSynopsis, setEditSynopsis] = useState('');
  const [editStatus, setEditStatus] = useState('in_progress');
  const [loading, setLoading] = useState({
    bootstrap: false,
    createCharacter: false,
    createStory: false,
    loadStory: false,
    continueStory: false,
    updateStory: false,
  });

  // ── Comic Strip Export State ─────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);
  const [comicPreviewUrl, setComicPreviewUrl] = useState(null);
  const [comicLayout, setComicLayout] = useState('horizontal');
  const [comicError, setComicError] = useState(null);
  const [showComicModal, setShowComicModal] = useState(false);
  const [upgradeNeeded, setUpgradeNeeded] = useState(null); // [NEW] { title, message }

  // Avatar Engine hook — updates character avatarUrl in local state on success
  const { generateAvatarForCharacter, loading: avatarLoading, error: avatarError } =
    useAvatarGeneration({
      onSuccess: (characterId, imageUrl) => {
        setCharacters((prev) =>
          prev.map((c) =>
            String(c.id) === String(characterId) ? { ...c, avatarUrl: imageUrl } : c
          )
        );
      },
    });
  const loadingStories = loading.bootstrap;
  const isThinking = loading.continueStory;

  const selectedStory = useMemo(
    () => stories.find((story) => String(story.id) === String(selectedStoryId)),
    [stories, selectedStoryId]
  );

  const displayedStoryTitle =
    storyTitle || selectedStory?.title || (selectedStoryId ? `Story ${selectedStoryId}` : '');

  const filteredStories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const list = stories.filter((story) => {
      if (statusFilter !== 'all' && story.status !== statusFilter) return false;
      if (query && !story.title?.toLowerCase().includes(query)) return false;
      return true;
    });

    return list.sort((a, b) => {
      const dateA = new Date(a.lastActivityAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.lastActivityAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [stories, statusFilter, searchQuery]);

  useEffect(() => {
    async function loadInitialData() {
      setLoading((prev) => ({ ...prev, bootstrap: true }));
      try {
        const [charactersRes, storiesRes] = await Promise.all([
          fetch(`${API_BASE}/characters`),
          fetch(`${API_BASE}/stories`),
        ]);

        const charactersData = await charactersRes.json();
        const storiesData = await storiesRes.json();

        const safeCharacters = Array.isArray(charactersData) ? charactersData : [];
        const safeStories = Array.isArray(storiesData)
          ? storiesData.map(normalizeStory)
          : [];

        setCharacters(safeCharacters);
        setStories(safeStories);
        console.log('[App] Loaded Characters:', safeCharacters.length);

        if (!selectedCharacterId && safeCharacters.length > 0) {
          setSelectedCharacterId(String(safeCharacters[0].id));
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading((prev) => ({ ...prev, bootstrap: false }));
      }
    }

    loadInitialData();
  }, []); // Only load on mount

  // Fetch Home Feed
  useEffect(() => {
    if (activeView === 'home') {
      fetch(`${API_BASE}/api/home/stories`)
        .then(res => res.json())
        .then(data => setHomeFeed(data))
        .catch(err => console.error(err));
    }
  }, [activeView]);

  // Fetch Series Details
  useEffect(() => {
    if (activeView === 'series' && viewedSeriesId) {
      fetch(`${API_BASE}/api/series/${viewedSeriesId}`)
        .then(res => res.json())
        .then(data => setSeriesData(data))
        .catch(err => console.error(err));
    }
  }, [activeView, viewedSeriesId]);

  // Fetch Reader Data
  useEffect(() => {
    if (activeView === 'reader' && viewedEpisodeId) {
      fetch(`${API_BASE}/api/episodes/${viewedEpisodeId}`)
        .then(res => res.json())
        .then(data => setReaderData(data))
        .catch(err => console.error(err));
    }
  }, [activeView, viewedEpisodeId]);

  useEffect(() => {
    async function loadStory() {
      if (!selectedStoryId) {
        setStoryLog([]);
        setWorldState({});
        setStoryTitle('');
        return;
      }

      setLoading((prev) => ({ ...prev, loadStory: true }));
      try {
        const res = await fetch(`${API_BASE}/stories/${selectedStoryId}`);
        const data = await res.json();

        setStoryLog(Array.isArray(data.log) ? data.log : []);
        setWorldState(data.worldState || {});
        setStoryTitle(data.title || '');

        if (data?.worldState?.genre) {
          setGenre(data.worldState.genre);
        }
        if (data?.worldState?.scenario) {
          setScenario(data.worldState.scenario);
        }

        setStories((prev) => {
          const id = String(data.id || selectedStoryId);
          const normalized = normalizeStory(data);
          const exists = prev.some((story) => String(story.id) === id);
          const updated = prev.map((story) =>
            String(story.id) === id ? { ...story, ...normalized } : story
          );

          if (exists) return updated;

          return [{ id, ...normalized }, ...updated];
        });
      } catch (error) {
        console.error(error);
      } finally {
        setLoading((prev) => ({ ...prev, loadStory: false }));
      }
    }

    loadStory();
  }, [selectedStoryId]);

  // Polling for pending scenes
  useEffect(() => {
    const hasPendingImages = storyLog.some(scene => scene.imageStatus === 'pending');
    let intervalId;

    if (hasPendingImages && selectedStoryId) {
      intervalId = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/stories/${selectedStoryId}`);
          if (res.ok) {
            const data = await res.json();
            setStoryLog(Array.isArray(data.log) ? data.log : []);
          }
        } catch (error) {
          console.error('Error polling for images:', error);
        }
      }, 3000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [storyLog, selectedStoryId]);

  async function handleCreateCharacter(event) {
    event.preventDefault();
    const trimmedName = newCharacterName.trim();
    const trimmedDescription = newCharacterDescription.trim();

    if (!trimmedName) return;

    setLoading((prev) => ({ ...prev, createCharacter: true }));
    setUpgradeNeeded(null); // Reset any previous error

    try {
      const res = await fetch(`${API_BASE}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          description: trimmedDescription,
          persona: '',
          goals: '',
          limits: '',
        }),
      });

      const data = await res.json();

      if (res.status === 403) {
        setUpgradeNeeded({
          title: '¡Llegaste al límite!',
          message: data.message || 'Has alcanzado el límite de personajes permitidos en tu plan actual.'
        });
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Error al crear personaje');

      setCharacters((prev) => [data, ...prev]);
      setSelectedCharacterId(String(data.id));
      setNewCharacterName('');
      setNewCharacterDescription('');
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setLoading((prev) => ({ ...prev, createCharacter: false }));
    }
  }

  async function handleCreateStory(event) {
    event.preventDefault();
    if (!selectedCharacterId) return;

    const character = characters.find(
      (item) => String(item.id) === String(selectedCharacterId)
    );
    const title = `Historia con ${character?.name || 'personaje'}`;

    setLoading((prev) => ({ ...prev, createStory: true }));
    try {
      const res = await fetch(`${API_BASE}/stories/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          genre,
          scenario,
          characterIds: [selectedCharacterId],
        }),
      });

      const data = await res.json();
      const newStoryId = String(data.storyId);
      const normalized = normalizeStory({
        id: newStoryId,
        title: data.title || title,
        synopsis: data.synopsis || '',
        status: data.status || 'in_progress',
        worldState: data.worldState || {},
        lastActivityAt: data.lastActivityAt || new Date().toISOString(),
        messageCount: data.messageCount || (data.log ? data.log.length : 1),
        createdAt: data.createdAt || new Date().toISOString(),
      });

      setSelectedStoryId(newStoryId);
      setStoryTitle(normalized.title);
      setWorldState(normalized.worldState || {});
      setStoryLog(Array.isArray(data.log) ? data.log : []);
      setShowCreateStory(false);

      setStories((prev) => {
        const next = prev.filter((story) => String(story.id) !== newStoryId);
        return [normalized, ...next];
      });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading((prev) => ({ ...prev, createStory: false }));
    }
  }

  function handleSelectStory(storyId) {
    setSelectedStoryId(String(storyId));
  }

  function handleOpenEditStory(story) {
    setEditingStory(story);
    setEditTitle(story.title || '');
    setEditSynopsis(story.synopsis || '');
    setEditStatus(story.status || 'in_progress');
  }

  function handleCloseEditStory() {
    setEditingStory(null);
    setEditTitle('');
    setEditSynopsis('');
    setEditStatus('in_progress');
  }

  async function handleSaveStoryEdit(event) {
    event.preventDefault();
    if (!editingStory) return;

    setLoading((prev) => ({ ...prev, updateStory: true }));
    try {
      const res = await fetch(`${API_BASE}/stories/${editingStory.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          synopsis: editSynopsis,
          status: editStatus,
        }),
      });

      const updated = await res.json();
      const normalized = normalizeStory(updated);

      setStories((prev) =>
        prev.map((story) => (String(story.id) === String(updated.id) ? normalized : story))
      );

      if (String(selectedStoryId) === String(updated.id)) {
        setStoryTitle(normalized.title || '');
      }

      handleCloseEditStory();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading((prev) => ({ ...prev, updateStory: false }));
    }
  }



  async function handleTogglePublish(storyId, currentStatus) {
    const nextStatus = currentStatus === 'published' ? 'draft' : 'published';
    setLoading((prev) => ({ ...prev, updateStory: true }));
    try {
      // Assuming existing status field can be used or adding a dummy update for now
      const res = await fetch(`${API_BASE}/stories/${storyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const updated = await res.json();
      const normalized = normalizeStory(updated);

      setStories((prev) =>
        prev.map((story) => (String(story.id) === String(storyId) ? normalized : story))
      );
    } catch (error) {
      console.error(error);
    } finally {
      setLoading((prev) => ({ ...prev, updateStory: false }));
    }
  }

  function handleCreateEpisode(storyId) {
    setSelectedStoryId(String(storyId));
    setActiveView('studio');
    setActiveTab('stories');
    // Logic to jump to input or start prompt
    setInput('');
  }

  async function handleContinueStory(event) {
    event.preventDefault();
    if (!selectedStoryId || !input.trim()) return;

    setLoading((prev) => ({ ...prev, continueStory: true }));
    try {
      const res = await fetch(`${API_BASE}/stories/${selectedStoryId}/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });

      const data = await res.json();
      setStoryLog(Array.isArray(data.log) ? data.log : []);
      setWorldState(data.worldState || worldState);
      setInput('');

      setStories((prev) =>
        prev.map((story) => {
          if (String(story.id) !== String(selectedStoryId)) return story;
          return normalizeStory({
            ...story,
            lastActivityAt: data.lastActivityAt || new Date().toISOString(),
            messageCount: data.messageCount || story.messageCount + 1,
            worldState: data.worldState || story.worldState,
          });
        })
      );
    } catch (error) {
      console.error(error);
    } finally {
      setLoading((prev) => ({ ...prev, continueStory: false }));
    }
  }

  // ── Comic Strip Export Handler ───────────────────────────────
  async function handleExportComic() {
    if (!selectedStoryId) return;
    setIsExporting(true);
    setComicError(null);
    setComicPreviewUrl(null);
    setShowComicModal(true);
    try {
      const res = await fetch(`${API_BASE}/api/stories/${selectedStoryId}/comic-strip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxPanels: 6, layout: comicLayout }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al generar el cómic');
      setComicPreviewUrl(resolveAssetUrl(data.imageUrl));
    } catch (err) {
      setComicError(err.message);
    } finally {
      setIsExporting(false);
    }
  }

  function handleCloseComicModal() {
    setShowComicModal(false);
    setComicPreviewUrl(null);
    setComicError(null);
  }

  function getStoryPreview(story) {
    if (String(story.id) === String(selectedStoryId) && storyLog.length > 0) {
      return storyLog[0]?.text || story.synopsis || story.worldState?.scenario || '';
    }
    return story.synopsis || story.worldState?.scenario || 'Sinopsis pendiente';
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="header-container">
          <div className="app__logo" onClick={() => setActiveView('home')}>
            <h1 className="app__title">Creativistorias</h1>
            <p className="app__subtitle">Editorial Mode</p>
          </div>
          <nav className="main-nav">
            <button
              id="nav-inicio"
              className={`main-nav-btn ${activeView === 'home' ? 'active' : ''}`}
              onClick={() => setActiveView('home')}
            >
              Inicio
            </button>
            <button
              id="nav-estudio"
              className={`main-nav-btn ${activeView === 'studio' ? 'active' : ''}`}
              onClick={() => setActiveView('studio')}
            >
              Estudio
            </button>
          </nav>
        </div>
      </header>

      <main className="app__main">
        {activeView === 'home' && (
          <div className="home-view">

            <div className="home-container">

              {/* HERO SECTION */}
              <section className="home-hero-section">
                <span className="hero-eyebrow">Plataforma Editorial</span>
                <h1 className="hero-title">El hogar de las mejores historias</h1>
                <p className="hero-supporting">
                  Descubre narraciones inmersivas creadas por nuestra comunidad y potenciadas con IA.
                  Una nueva era de storytelling interactivo.
                </p>
                <div className="hero-actions">
                  <button
                    className="pill-btn primary"
                    onClick={() => { setActiveView('studio'); setShowCreateStory(true); }}
                  >
                    Publicar historia
                  </button>
                  <button
                    className="pill-btn secondary"
                    onClick={() => setActiveView('studio')}
                  >
                    Abrir Estudio →
                  </button>
                </div>
              </section>

              {/* POPULARES DE HOY SECTION */}
              <section className="home-content-section">
                <h2 className="section-heading">Populares de hoy</h2>

                {/* Empty State Component */}
                {homeFeed.length === 0 ? (
                  <div className="empty-state-card">
                    <div className="empty-icon-wrapper">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                    </div>
                    <h3 className="empty-state-title">Sé el primero en publicar</h3>
                    <p className="empty-state-text">
                      Nuestra comunidad está esperando nuevas historias. Empieza a crear la tuya y descubre todo lo que puedes lograr.
                    </p>
                    <button
                      className="pill-btn outline"
                      onClick={() => { setActiveView('studio'); setShowCreateStory(true); }}
                    >
                      Crear mi historia
                    </button>
                  </div>
                ) : (
                  <div className="feed-grid">
                    {/* Placeholder for when feed is populated */}
                  </div>
                )}
              </section>

              {/* EXPLORAR HISTORIAS SECTION */}
              {homeFeed.length === 0 && (
                <section className="home-content-section">
                  <h2 className="section-heading">Explorar historias</h2>
                  <div className="genre-chip-row">
                    {['Fantasía', 'Ciencia Ficción', 'Romance', 'Terror', 'Aventura', 'Misterio', 'Acción', 'Drama', 'Comedia'].map(genre => (
                      <div key={genre} className="genre-chip">{genre}</div>
                    ))}
                  </div>
                </section>
              )}
            </div>

          </div>
        )}

        {activeView === 'series' && seriesData && (
          <div className="series-view">
            <div className="series-header">
              <div className="series-cover-large">
                {seriesData.coverImageUrl ? (
                  <img src={resolveAssetUrl(seriesData.coverImageUrl)} alt={seriesData.title} />
                ) : (
                  <div className="series-cover-placeholder">P</div>
                )}
              </div>
              <div className="series-header-info">
                <span className="series-genre">{seriesData.genre || 'Fantasia'}</span>
                <h2>{seriesData.title}</h2>
                <p>{seriesData.synopsis || 'Esta historia no tiene sinopsis.'}</p>
                <div className="series-actions">
                  {seriesData.episodes.length > 0 ? (
                    <button className="read-btn" onClick={() => {
                      setViewedEpisodeId(seriesData.episodes[0].id);
                      setActiveView('reader');
                    }}>
                      LEER EP. 1
                    </button>
                  ) : (
                    <button className="read-btn" disabled>PROXIMAMENTE</button>
                  )}
                </div>
              </div>
            </div>
            <div className="series-episodes">
              <h3>Episodios ({seriesData.episodes.length})</h3>
              <div className="episode-list">
                {seriesData.episodes.length === 0 && <p className="empty-state">Aun no hay episodios.</p>}
                {seriesData.episodes.map(ep => (
                  <div key={ep.id} className="episode-item" onClick={() => {
                    setViewedEpisodeId(ep.id);
                    setActiveView('reader');
                  }}>
                    <div className="episode-number">#{ep.episodeNumber}</div>
                    <div className="episode-title">{ep.title}</div>
                    <div className="episode-date">
                      {ep.publishedAt ? new Date(ep.publishedAt).toLocaleDateString() : 'Reciente'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeView === 'reader' && readerData && (
          <div className="reader-view">
            <div className="reader-header">
              <button className="back-btn" onClick={() => setActiveView('series')}>&larr; Volver a Serie</button>
              <div className="reader-title">
                <span>{readerData.storyTitle}</span>
                <h2>{readerData.title}</h2>
              </div>
            </div>
            <div className="reader-content">
              {readerData.scenes.map((scene, idx) => (
                <div key={idx} className="reader-scene">
                  {scene.imageUrl && (
                    <img src={resolveAssetUrl(scene.imageUrl)} alt="Scene" className="reader-image" />
                  )}
                  <p className="reader-text">{scene.text}</p>
                </div>
              ))}
            </div>
            <div className="reader-footer">
              <button className="back-btn" onClick={() => setActiveView('series')}>Volver a la Lista de Episodios</button>
            </div>
          </div>
        )}

        {activeView === 'studio' && (
          <div className="studio-view">
            <header className="studio-header">
              <div className="studio-tabs">
                <button
                  className={`studio-tab ${activeTab === 'stories' ? 'active' : ''}`}
                  onClick={() => setActiveTab('stories')}
                >
                  Mis Historias
                </button>
                <button
                  className={`studio-tab ${activeTab === 'characters' ? 'active' : ''}`}
                  onClick={() => setActiveTab('characters')}
                >
                  Personajes
                </button>
              </div>
            </header>

            {activeTab === 'stories' ? (
              <div className="stories-layout">
                <section className="stories-panel">
                  <div className="panel-header">
                    <h2>Biblioteca</h2>
                    <button
                      className="primary-btn"
                      type="button"
                      onClick={() => setShowCreateStory((prev) => !prev)}
                    >
                      + Nueva historia
                    </button>
                  </div>

                  <div className="filters">
                    {STATUS_FILTERS.map((filter) => (
                      <button
                        key={filter.value}
                        className={`filter-chip ${statusFilter === filter.value ? 'active' : ''
                          }`}
                        type="button"
                        onClick={() => setStatusFilter(filter.value)}
                      >
                        {filter.label}
                      </button>
                    ))}
                    <input
                      className="search-input"
                      placeholder="Buscar por titulo..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </div>

                  {showCreateStory && (
                    <form className="create-story" onSubmit={handleCreateStory}>
                      <div className="field">
                        <label>Personaje</label>
                        <select
                          value={selectedCharacterId}
                          onChange={(event) => setSelectedCharacterId(event.target.value)}
                        >
                          <option value="">Selecciona personaje</option>
                          {characters.map((character) => (
                            <option key={character.id} value={character.id}>
                              {character.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Genero</label>
                        <input
                          value={genre}
                          onChange={(event) => setGenre(event.target.value)}
                          placeholder="Fantasia, sci-fi..."
                        />
                      </div>
                      <div className="field">
                        <label>Escenario</label>
                        <input
                          value={scenario}
                          onChange={(event) => setScenario(event.target.value)}
                          placeholder="Bosque oscuro"
                        />
                      </div>
                      <button
                        className="primary-btn"
                        type="submit"
                        disabled={!selectedCharacterId || loading.createStory}
                      >
                        {loading.createStory ? 'Creando...' : 'Crear'}
                      </button>
                    </form>
                  )}

                  <div className="stories-grid">
                    {loadingStories &&
                      Array.from({ length: 3 }).map((_, index) => (
                        <div className="skeleton-card" key={`skeleton-${index}`}>
                          <div className="skeleton-badge" />
                          <div className="skeleton-title" />
                          <div className="skeleton-line" />
                          <div className="skeleton-line short" />
                          <div className="skeleton-progress" />
                        </div>
                      ))}

                    {!loadingStories && filteredStories.length === 0 && (
                      <p style={{ color: '#8b8b8b', margin: 0 }}>
                        No hay historias para este filtro.
                      </p>
                    )}

                    {!loadingStories &&
                      filteredStories.map((story) => {
                        const isActive = String(story.id) === String(selectedStoryId);
                        const preview = truncateText(getStoryPreview(story), 120);
                        const badgeClass = story.status === 'completed'
                          ? 'completed'
                          : story.status === 'paused'
                            ? 'paused'
                            : story.status === 'archived'
                              ? 'archived'
                              : 'progress';
                        const rawProgress = Number(story.worldState?.progress ?? 0);
                        const progressValue = Math.max(0, Math.min(100, rawProgress));

                        return (
                          <article
                            key={story.id}
                            className={`story-card ${isActive ? 'active' : ''}`}
                            onClick={() => handleSelectStory(story.id)}
                          >
                            <div className="story-card-inner">
                              <div className="story-card-thumbnail">
                                {story.coverImageUrl ? (
                                  <img src={story.coverImageUrl} alt={story.title} className="story-thumbnail" />
                                ) : (
                                  <div className="story-thumbnail-placeholder">
                                    {story.title?.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <span className={`badge-mini ${badgeClass}`}>
                                  {STATUS_LABELS[story.status] || '...'}
                                </span>
                              </div>

                              <div className="story-card-info">
                                <h3 className="story-card-title">{story.title || `Historia ${story.id}`}</h3>
                                <p className="story-card-preview">{preview}</p>
                                <div className="story-card-meta">
                                  <span>{story.messageCount} episodios</span>
                                  <div className="story-hover-actions">
                                    <button
                                      className="studio-icon-btn"
                                      title="Publicar"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleTogglePublish(story.id, story.status);
                                      }}
                                    >
                                      {story.status === 'completed' ? '👁️' : '📤'}
                                    </button>
                                    <button
                                      className="studio-icon-btn"
                                      title="Editar"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleOpenEditStory(story);
                                      }}
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      className="studio-icon-btn"
                                      title="Continuar"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleCreateEpisode(story.id);
                                      }}
                                    >
                                      ➕
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                  </div>
                </section>

                <aside className="roleplay-panel">
                  <div className="roleplay-header-refined">
                    <div className="roleplay-header-top">
                      <h2 className="roleplay-title-active">{displayedStoryTitle || 'Selecciona una historia'}</h2>
                      {worldState?.arc && (
                        <div className="minimal-arc">
                          <span className="arc-step">{worldState.arc.nextBeat || 'Explorar'}</span>
                          <div className="arc-bar-mini">
                            <div className="arc-fill-mini" style={{ width: `${worldState.arc.progress || 0}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="roleplay-header-actions">
                      <div className="roleplay-context">
                        {worldState?.genre} • {worldState?.scenario}
                      </div>
                      {selectedStoryId && (
                        <div className="comic-export-row">
                          <select
                            id="comic-layout-select"
                            className="comic-layout-select"
                            value={comicLayout}
                            onChange={(e) => setComicLayout(e.target.value)}
                            title="Disposición del cómic"
                          >
                            <option value="horizontal">Tira horizontal</option>
                            <option value="grid">Cuadrícula 2×N</option>
                          </select>
                          <button
                            id="btn-export-comic"
                            className="comic-export-btn"
                            onClick={handleExportComic}
                            disabled={isExporting}
                            title="Exportar escenas como cómic"
                          >
                            {isExporting ? (
                              <><span className="comic-spinner" /> Generando…</>
                            ) : (
                              <>🎨 Exportar como cómic</>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="log">
                    {loading.loadStory && <p>Cargando historia...</p>}
                    {!loading.loadStory && storyLog.length === 0 && (
                      <p style={{ color: '#8b8b8b', margin: 0 }}>
                        Elige una historia para ver el role-play.
                      </p>
                    )}
                    {storyLog.map((scene, index) => {
                      const isLatest = index === 0;
                      return (
                        <div
                          key={`${scene.createdAt || index}`}
                          className={`scene-editorial ${isLatest ? 'is-latest' : 'is-history'}`}
                        >
                          {!isLatest && <div className="scene-divider"></div>}
                          <div className="scene-body">
                            {scene.chapter && <span className="scene-chapter-badge">Cap {scene.chapter}</span>}
                            <p className="scene-text-editorial">{scene.text}</p>
                            {scene.playerInput && (
                              <div className="player-input-bubble">
                                <span className="input-label">Tu</span>
                                <p>{scene.playerInput}</p>
                              </div>
                            )}
                          </div>

                          {scene.imageStatus === 'pending' && (
                            <div className="scene-image-wrapper placeholder">
                              <div className="scene-image-skeleton shimmering"></div>
                              <span className="scene-image-loading-text">Capturando momento cinematográfico...</span>
                            </div>
                          )}

                          {scene.imageStatus === 'ready' && scene.imageUrl && (
                            <div className="scene-image-wrapper">
                              <img src={scene.imageUrl} alt="Momento cinematográfico" className="scene-image" />
                            </div>
                          )}

                          {scene.imageStatus === 'error' && (
                            <p className="scene-image-error">No se pudo capturar la imagen.</p>
                          )}
                        </div>
                      );
                    })}
                    {isThinking && (
                      <div className="ai-typing">
                        <span>Akira esta pensando...</span>
                        <span className="ai-cursor" />
                      </div>
                    )}
                  </div>

                  <footer className="roleplay-footer">
                    <form className="minimal-input-area" onSubmit={handleContinueStory}>
                      <textarea
                        rows={1}
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder="¿Qué sucede ahora?"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleContinueStory(e);
                          }
                        }}
                      />
                      <button
                        className="send-icon-btn"
                        type="submit"
                        disabled={!selectedStoryId || isThinking}
                      >
                        {isThinking ? '⏳' : '➔'}
                      </button>
                    </form>
                  </footer>
                </aside>
              </div>
            ) : (
              <section className="characters-page">
                <div className="characters-container">
                  <div className="page-header">
                    <h2 className="page-title">Personajes</h2>
                    <p className="page-subtitle">Gestiona el elenco y las identidades visuales de tus historias.</p>
                  </div>

                  <div className="characters-grid">
                    {/* ── CREATE PANEL ── */}
                    <div className="create-character-panel">
                      <h3 className="panel-title">Crear Nuevo</h3>
                      <p className="panel-helper">Diseña el perfil de tu personaje.</p>

                      <form className="character-form" onSubmit={handleCreateCharacter}>
                        <div className="form-group">
                          <label>Nombre</label>
                          <input
                            className="styled-input"
                            value={newCharacterName}
                            onChange={(event) => setNewCharacterName(event.target.value)}
                            placeholder="Ej. Elara Vance"
                          />
                        </div>
                        <div className="form-group">
                          <label>Descripción (Opcional)</label>
                          <textarea
                            className="styled-input"
                            rows={3}
                            value={newCharacterDescription}
                            onChange={(event) => setNewCharacterDescription(event.target.value)}
                            placeholder="Breve historia o detalles físicos..."
                          />
                        </div>
                        {/* ── UPGRADE MESSAGE ── */}
                        {upgradeNeeded && (
                          <div className="upgrade-needed-box">
                            <div className="upgrade-icon">🚀</div>
                            <div className="upgrade-content">
                              <h4>{upgradeNeeded.title}</h4>
                              <p>{upgradeNeeded.message}</p>
                              <button
                                className="pill-btn accent compact"
                                onClick={() => alert("Próximamente: Integración con Stripe")}
                              >
                                Saber más sobre PRO
                              </button>
                            </div>
                          </div>
                        )}

                        <button
                          className="pill-btn primary full-width form-submit-btn"
                          type="submit"
                          disabled={loading.createCharacter}
                        >
                          {loading.createCharacter ? 'Creando...' : 'Crear personaje'}
                        </button>
                      </form>
                    </div>

                    {/* ── CHARACTER LIST ── */}
                    <div className="character-list-container">
                      {characters.length === 0 && (
                        <div className="empty-state-card list-empty">
                          <h4 className="empty-state-title">Aún no hay personajes</h4>
                          <p className="empty-state-text">Empieza agregando un personaje en el panel izquierdo.</p>
                        </div>
                      )}

                      {avatarError && (
                        <div className="error-banner">
                          <span className="error-icon">⚠️</span> Error al generar avatar: {avatarError}
                        </div>
                      )}

                      <div className="character-list">
                        {characters.map((character) => {
                          const isActive = String(character.id) === String(selectedCharacterId);
                          const isGeneratingThis = avatarLoading && String(character.id) === String(selectedCharacterId);

                          return (
                            <div
                              key={character.id}
                              className={`styled-character-card ${isActive ? 'active' : ''}`}
                              onClick={() => setSelectedCharacterId(String(character.id))}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="card-avatar-container">
                                {character.avatarUrl ? (
                                  <img
                                    className="card-avatar-img"
                                    src={character.avatarUrl}
                                    alt={`Avatar de ${character.name}`}
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="card-avatar-fallback">
                                    <span>{character.name.charAt(0).toUpperCase()}</span>
                                  </div>
                                )}
                              </div>

                              <div className="card-content">
                                <div className="card-header-row">
                                  <h4 className="card-name">{character.name}</h4>
                                  <span className="card-id-badge">#{character.id}</span>
                                </div>

                                <p className={`card-description ${!character.description ? 'muted' : ''}`}>
                                  {character.description || 'Sin descripción'}
                                </p>

                                <div className="card-actions">
                                  <button
                                    className="pill-btn ghost compact"
                                    type="button"
                                    disabled={avatarLoading}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      generateAvatarForCharacter(character);
                                    }}
                                  >
                                    {isGeneratingThis
                                      ? '⏳ Generando entidad...'
                                      : character.avatarUrl
                                        ? '⟳ Reconstruir identidad oficial'
                                        : '✨ Generar identidad'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* ── Comic Strip Preview Modal ─────────────────────────── */}
      {showComicModal && (
        <div className="modal-backdrop" onClick={handleCloseComicModal}>
          <div className="comic-modal" onClick={(e) => e.stopPropagation()}>
            <div className="comic-modal-header">
              <h3 className="comic-modal-title">🎨 Cómic exportado</h3>
              <button className="comic-modal-close" onClick={handleCloseComicModal}>✕</button>
            </div>

            {isExporting && (
              <div className="comic-modal-loading">
                <div className="comic-loader-ring" />
                <p>Componiendo los paneles…</p>
                <span className="comic-loader-sub">Esto puede tardar unos segundos</span>
              </div>
            )}

            {comicError && !isExporting && (
              <div className="comic-modal-error">
                <span>⚠️</span>
                <p>{comicError}</p>
              </div>
            )}

            {comicPreviewUrl && !isExporting && (
              <>
                <div className="comic-preview-container">
                  <img
                    src={comicPreviewUrl}
                    alt="Comic strip preview"
                    className="comic-preview-img"
                  />
                </div>
                <div className="comic-modal-actions">
                  <a
                    href={comicPreviewUrl}
                    download={`comic-${selectedStoryId}.png`}
                    className="pill-btn primary"
                  >
                    ⬇ Descargar PNG
                  </a>
                  <button
                    className="pill-btn secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(comicPreviewUrl);
                    }}
                  >
                    🔗 Copiar enlace
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {editingStory && (
        <div className="modal-backdrop" onClick={handleCloseEditStory}>
          <form
            className="modal"
            onSubmit={handleSaveStoryEdit}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 style={{ margin: 0 }}>Editar historia</h3>
            <div className="field">
              <label>Titulo</label>
              <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
            </div>
            <div className="field">
              <label>Sinopsis</label>
              <textarea
                rows={3}
                value={editSynopsis}
                onChange={(event) => setEditSynopsis(event.target.value)}
              />
            </div>
            <div className="field">
              <label>Estado</label>
              <select value={editStatus} onChange={(event) => setEditStatus(event.target.value)}>
                <option value="in_progress">En curso</option>
                <option value="paused">Pausada</option>
                <option value="completed">Terminada</option>
                <option value="archived">Archivada</option>
              </select>
            </div>
            <div className="modal-actions">
              <button
                className="story-action-btn"
                type="button"
                onClick={handleCloseEditStory}
              >
                Cancelar
              </button>
              <button className="primary-btn" type="submit" disabled={loading.updateStory}>
                {loading.updateStory ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      <style jsx global>{`
        /* ── COMIC EXPORT ──────────────────────────────────────── */
        .roleplay-header-actions {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .comic-export-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .comic-layout-select {
          appearance: none;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(45, 212, 191, 0.2);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 0.75rem;
          font-family: 'Inter', sans-serif;
          padding: 0.35rem 0.7rem;
          cursor: pointer;
          transition: var(--transition);
        }
        .comic-layout-select:hover {
          border-color: var(--accent);
          color: var(--text-primary);
        }

        .comic-export-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 0.9rem;
          background: linear-gradient(135deg, rgba(45,212,191,0.15), rgba(45,212,191,0.05));
          border: 1px solid rgba(45, 212, 191, 0.3);
          border-radius: 8px;
          color: var(--accent);
          font-size: 0.8rem;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          transition: var(--transition);
          white-space: nowrap;
        }
        .comic-export-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(45,212,191,0.25), rgba(45,212,191,0.1));
          border-color: var(--accent);
          box-shadow: 0 0 16px rgba(45, 212, 191, 0.15);
          transform: translateY(-1px);
        }
        .comic-export-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .comic-spinner {
          display: inline-block;
          width: 10px;
          height: 10px;
          border: 2px solid rgba(45,212,191,0.3);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── COMIC MODAL ──────────────────────────────────────── */
        .comic-modal {
          background: var(--bg-elevated);
          border: 1px solid rgba(45, 212, 191, 0.15);
          border-radius: var(--radius-lg);
          box-shadow: 0 30px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
          padding: 2rem;
          width: min(92vw, 860px);
          max-height: 90vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }

        .comic-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .comic-modal-title {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 700;
          background: linear-gradient(135deg, #fff 30%, var(--accent) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .comic-modal-close {
          background: none;
          border: none;
          color: var(--text-dim);
          font-size: 1.1rem;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
          border-radius: 6px;
          transition: var(--transition);
        }
        .comic-modal-close:hover { color: #fff; background: rgba(255,255,255,0.05); }

        .comic-modal-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 3rem 0;
          color: var(--text-secondary);
        }
        .comic-loader-ring {
          width: 48px;
          height: 48px;
          border: 3px solid rgba(45,212,191,0.15);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        .comic-loader-sub {
          font-size: 0.78rem;
          color: var(--text-dim);
        }

        .comic-modal-error {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: var(--radius-sm);
          color: #fca5a5;
          font-size: 0.9rem;
        }

        .comic-preview-container {
          background: #0d0d0d;
          border-radius: var(--radius-md);
          overflow: hidden;
          border: 1px solid var(--border-subtle);
        }
        .comic-preview-img {
          width: 100%;
          height: auto;
          display: block;
          border-radius: var(--radius-md);
        }

        .comic-modal-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        :root {
          --bg-deep: #08080a;
          --bg-surface: #121216;
          --bg-elevated: #1a1a20;
          --accent: #2dd4bf;
          --accent-muted: rgba(45, 212, 191, 0.2);
          --text-primary: #f8fafc;
          --text-secondary: #94a3b8;
          --text-dim: #64748b;
          --border-subtle: #22222a;
          --radius-sm: 8px;
          --radius-md: 12px;
          --radius-lg: 20px;
          --shadow-soft: 0 10px 30px -10px rgba(0,0,0,0.5);
          --transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: var(--bg-base);
          color: var(--text-primary);
          font-family: 'Inter', -apple-system, sans-serif;
        }

        .app {
          min-height: 100vh;
          background: radial-gradient(circle at top, #141821 0%, var(--bg-base) 60%);
        }

        .app__header {
          padding: 0.85rem 2rem;
          border-bottom: 1px solid rgba(45, 212, 191, 0.06);
          background: rgba(8, 8, 12, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          max-width: 1280px;
          margin: 0 auto;
          width: 100%;
        }

        .app__logo {
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 0.05rem;
        }

        .app__title {
          margin: 0;
          font-family: 'Outfit', sans-serif;
          font-size: 1.4rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          background: linear-gradient(135deg, #fff 30%, var(--accent) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          line-height: 1;
        }

        .app__subtitle {
          margin: 0;
          color: var(--text-dim);
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        /* ── PREMIUM NAV ──────────────────────────────────── */
        .main-nav {
          display: flex;
          gap: 0.25rem;
          padding: 0.3rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 999px;
        }

        .main-nav-btn {
          padding: 0.45rem 1.2rem;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: var(--text-dim);
          font-family: 'Inter', sans-serif;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition);
          letter-spacing: 0.01em;
        }

        .main-nav-btn:hover {
          color: #fff;
          background: rgba(255,255,255,0.06);
        }

        .main-nav-btn.active {
          background: rgba(45, 212, 191, 0.12);
          color: var(--accent);
          box-shadow: inset 0 0 0 1px rgba(45, 212, 191, 0.2);
        }

        .tabs {
          margin-top: 1rem;
          display: inline-flex;
          gap: 0.4rem;
          padding: 0.3rem;
          background: #0b0b0b;
          border: 1px solid #1d1d1d;
          border-radius: 999px;
        }

        .tab {
          border: none;
          background: transparent;
          color: #8e8e8e;
          font-size: 0.9rem;
          padding: 0.45rem 1rem;
          border-radius: 999px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .tab.active {
          background: #151515;
          color: #f5f5f5;
          box-shadow: inset 0 0 0 1px #2a2a2a;
        }

        .studio-view {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 65px);
          overflow: hidden;
        }

        .studio-header {
          padding: 0.75rem 2rem;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
        }

        .studio-tabs {
          display: flex;
          gap: 1.5rem;
        }

        .studio-tab {
          background: transparent;
          border: none;
          color: var(--text-dim);
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          padding: 0.5rem 0;
          position: relative;
          transition: var(--transition);
        }

        .studio-tab.active {
          color: var(--accent);
        }

        .studio-tab.active::after {
          content: '';
          position: absolute;
          bottom: -0.75rem;
          left: 0;
          right: 0;
          height: 2px;
          background: var(--accent);
        }

        .stories-layout {
          display: grid;
          grid-template-columns: 380px 1fr;
          height: 100%;
          overflow: hidden;
        }

        .stories-panel {
          border-right: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          gap: 1.5rem;
          overflow-y: auto;
          background: var(--bg-surface);
        }

        .story-card {
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: var(--transition);
          padding: 0.5rem;
        }

        .story-card:hover {
          background: var(--bg-elevated);
          border-color: var(--border-subtle);
        }

        .story-card.active {
          background: var(--bg-elevated);
          border-color: var(--accent-muted);
          box-shadow: inset 0 0 0 1px var(--accent-muted);
        }

        .story-card-inner {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        .story-card-thumbnail {
          width: 80px;
          height: 100px;
          border-radius: var(--radius-sm);
          overflow: hidden;
          background: var(--bg-deep);
          position: relative;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .story-thumbnail {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .badge-mini {
          position: absolute;
          top: 4px;
          right: 4px;
          font-size: 0.55rem;
          padding: 0.1rem 0.3rem;
          border-radius: 4px;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(4px);
          color: #fff;
          text-transform: uppercase;
          font-weight: 800;
        }

        .story-card-info {
          flex: 1;
          min-width: 0;
        }

        .story-card-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .story-card-preview {
          margin: 0.25rem 0 0;
          font-size: 0.8rem;
          color: var(--text-secondary);
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          opacity: 0.7;
        }

        .story-card-meta {
          margin-top: 0.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.7rem;
          color: var(--text-dim);
        }

        .story-hover-actions {
          display: flex;
          gap: 0.35rem;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .story-card:hover .story-hover-actions {
          opacity: 1;
        }

        .studio-icon-btn {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          color: #fff;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          cursor: pointer;
        }

        .studio-icon-btn:hover {
          background: var(--accent);
          color: #000;
          border-color: var(--accent);
        }

        .roleplay-panel {
          background: #0f0f0f;
          border: 1px solid #1f1f1f;
          border-radius: 20px;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          min-height: 420px;
        }

        .roleplay-header h3 {
          margin: 0 0 0.4rem 0;
          font-size: 1.2rem;
        }

        .roleplay-subtitle {
          color: #9a9a9a;
          font-size: 0.85rem;
        }

        .arc-tracker {
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px dashed #1f1f1f;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .arc-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.75rem;
        }

        .arc-beat {
          color: #60a5fa;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .arc-stakes {
          color: #ef4444;
          opacity: 0.8;
        }

        .arc-progress-bar {
          background: #1b1b1b;
          height: 4px;
          border-radius: 999px;
          overflow: hidden;
        }

        .arc-progress-fill {
          background: linear-gradient(90deg, #3b82f6, #8b5cf6);
          height: 100%;
          border-radius: 999px;
          transition: width 0.8s ease-out;
        }

        .log {
          background: #080808;
          border: 1px solid #1f1f1f;
          border-radius: 16px;
          padding: 0.8rem;
          max-height: 320px;
          overflow-y: auto;
          display: grid;
          gap: 0.75rem;
        }

        .scene {
          border-bottom: 1px dashed #1d1d1d;
          padding-bottom: 0.75rem;
          opacity: 0;
          animation: slideInUp 0.45s ease both;
        }

        .scene:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .scene h4 {
          margin: 0 0 0.35rem 0;
          font-size: 0.75rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #77ddff;
        }

        .scene p {
          margin: 0;
          line-height: 1.5;
          white-space: pre-wrap;
        }

        .scene-image-wrapper {
          margin-top: 1rem;
          border-radius: 12px;
          overflow: hidden;
          position: relative;
          background: #0f1115;
          aspect-ratio: 16 / 9;
          display: flex;
          align-items: center;
        /* Right Panel - Editorial Reader */
        .roleplay-panel {
          display: flex;
          flex-direction: column;
          background: var(--bg-deep);
          position: relative;
          height: 100%;
        }

        .roleplay-header-refined {
          padding: 2rem 3rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          border-bottom: 1px solid var(--border-subtle);
        }

        .roleplay-header-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .roleplay-title-active {
          font-family: 'Outfit', sans-serif;
          font-size: 1.75rem;
          margin: 0;
          font-weight: 700;
        }

        .minimal-arc {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.25rem;
        }

        .arc-step {
          font-size: 0.7rem;
          color: var(--accent);
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        .arc-bar-mini {
          width: 100px;
          height: 3px;
          background: #1a1a20;
          border-radius: 99px;
          overflow: hidden;
        }

        .arc-fill-mini {
          height: 100%;
          background: var(--accent);
          transition: width 1s ease;
        }

        .roleplay-context {
          font-size: 0.9rem;
          color: var(--text-dim);
          font-weight: 500;
        }

        .log {
          flex: 1;
          padding: 2rem 3rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 3rem;
          background: transparent;
          border: none;
        }

        .scene-editorial {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 800px;
          margin: 0 auto;
          width: 100%;
        }

        .scene-editorial.is-history {
          opacity: 0.5;
          filter: grayscale(0.5);
          transition: var(--transition);
        }

        .scene-editorial.is-history:hover {
          opacity: 1;
          filter: grayscale(0);
        }

        .scene-body {
          position: relative;
        }

        .scene-chapter-badge {
          position: absolute;
          left: -4rem;
          top: 0.25rem;
          font-size: 0.7rem;
          font-weight: 800;
          color: var(--text-dim);
          text-transform: uppercase;
          transform: rotate(-90deg);
        }

        .scene-text-editorial {
          font-size: 1.15rem;
          line-height: 1.7;
          color: #e2e8f0;
          margin: 0;
          white-space: pre-wrap;
        }

        .player-input-bubble {
          margin-top: 1.5rem;
          background: var(--bg-surface);
          border-left: 3px solid var(--accent);
          padding: 1rem 1.5rem;
          border-radius: 0 var(--radius-md) var(--radius-md) 0;
        }

        .input-label {
          display: block;
          font-size: 0.65rem;
          text-transform: uppercase;
          font-weight: 800;
          color: var(--accent);
          margin-bottom: 0.5rem;
          letter-spacing: 0.1em;
        }

        .player-input-bubble p {
          margin: 0;
          font-weight: 500;
          color: #fff;
        }

        .scene-image-wrapper {
          border-radius: var(--radius-md);
          overflow: hidden;
          width: 100%;
          aspect-ratio: 16 / 9;
          box-shadow: var(--shadow-soft);
          border: 1px solid var(--border-subtle);
          background: var(--bg-deep);
        }

        .scene-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .roleplay-footer {
          padding: 1.5rem 3rem 2.5rem;
          background: linear-gradient(0deg, var(--bg-deep) 0%, transparent 100%);
        }

        .minimal-input-area {
          max-width: 800px;
          margin: 0 auto;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 999px;
          display: flex;
          align-items: center;
          padding: 0.5rem 0.5rem 0.5rem 1.5rem;
          transition: var(--transition);
        }

        .minimal-input-area:focus-within {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent-muted);
        }

        .minimal-input-area textarea {
          flex: 1;
          background: transparent;
          border: none;
          color: #fff;
          font-family: inherit;
          font-size: 1rem;
          resize: none;
          outline: none;
          padding: 0.5rem 0;
          height: 24px;
        }

        .send-icon-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: none;
          background: var(--accent);
          color: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: var(--transition);
          font-size: 1.2rem;
        }

        .characters-layout {
          background: #0d0d0d;
          border: 1px solid #1a1a1a;
          border-radius: 20px;
          padding: 1.5rem;
          display: grid;
          gap: 1.5rem;
        }

        .character-list {
          display: grid;
          gap: 0.75rem;
        }

        .character-card {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 1rem 1.2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          background: var(--bg-surface-elevated);
          cursor: pointer;
          transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }
        
        .character-card:hover {
          transform: translateY(-1px);
          background: var(--bg-surface-hover);
          box-shadow: var(--shadow-card);
        }

        .character-card.active {
          border-color: var(--accent);
          box-shadow: 0 0 0 1px var(--accent), var(--shadow-card);
          background: rgba(20, 184, 166, 0.05);
        }

        /* Avatar image / placeholder */
        .character-avatar-wrapper {
          flex-shrink: 0;
        }

        .character-avatar {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #2a2a2a;
          display: block;
        }

        .character-avatar-placeholder {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          border: 2px solid #2a2a2a;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.4rem;
          font-weight: 700;
          color: #6366f1;
        }

        /* Generate avatar button */
        .avatar-gen-btn {
          margin-top: 0.4rem;
          padding: 0.25rem 0.65rem;
          font-size: 0.78rem;
          border-radius: 999px;
          border: 1px solid #333;
          background: transparent;
          color: #a1a1aa;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s, background 0.15s;
          white-space: nowrap;
        }

        .avatar-gen-btn:hover:not(:disabled) {
          border-color: #6366f1;
          color: #a5b4fc;
          background: rgba(99, 102, 241, 0.08);
        }

        .avatar-gen-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .character-meta {
          color: #8d8d8d;
          font-size: 0.85rem;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 20;
        }

        .modal {
          background: #0f0f0f;
          border: 1px solid #262626;
          border-radius: 16px;
          padding: 1.25rem;
          width: min(420px, 90vw);
          display: grid;
          gap: 0.85rem;
        }

        .modal-actions {
          display: flex;
          gap: 0.6rem;
          justify-content: flex-end;
        }

        @keyframes slideInUp {
          from {
            transform: translateY(12px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes typing {
          0%,
          80%,
          100% {
            transform: scale(0.6);
            opacity: 0.4;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 0.8;
          }
          50% {
            opacity: 1;
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes blink {
          0%,
          100% {
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
        }

        /* ══════════════════════════════════════════════════
           PREMIUM EDITORIAL HOME VIEW
        ══════════════════════════════════════════════════ */

        .home-view {
          max-width: 1320px;
          margin: 0 auto;
          width: 100%;
          padding: 2.5rem 2rem 6rem;
          display: flex;
          flex-direction: column;
          gap: 4.5rem;
        }

        /* ── PREMIUM HERO ── */
        .premium-hero {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3rem;
          background: linear-gradient(145deg, #111116 0%, #08080c 100%);
          border-radius: 32px;
          padding: 4rem 4rem;
          border: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05),
                      0 25px 50px -12px rgba(0, 0, 0, 0.8);
          position: relative;
          overflow: hidden;
        }

        .premium-hero::before {
          content: '';
          position: absolute;
          top: -50%; right: -20%;
          width: 800px; height: 800px;
          background: radial-gradient(circle, rgba(45,212,191,0.06) 0%, transparent 60%);
          pointer-events: none;
        }

        .premium-hero-content {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
          z-index: 2;
        }

        .premium-badge {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--accent);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          padding: 0.4rem 1rem;
          background: rgba(45,212,191,0.1);
          border: 1px solid rgba(45,212,191,0.2);
          border-radius: 999px;
          margin-bottom: 1.5rem;
        }

        .premium-hero-title {
          font-family: 'Outfit', sans-serif;
          font-size: clamp(2.5rem, 4vw, 3.8rem);
          font-weight: 800;
          line-height: 1.1;
          color: #fff;
          margin: 0 0 1.25rem;
          letter-spacing: -0.03em;
        }

        .premium-hero-text {
          font-size: 1.1rem;
          color: var(--text-secondary);
          line-height: 1.6;
          max-width: 90%;
          margin: 0 0 2.5rem;
        }

        .premium-hero-actions {
          display: flex;
          gap: 1rem;
        }

        .premium-btn {
          padding: 0.85rem 2rem;
          border-radius: 999px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: none;
        }

        .premium-btn.primary {
          background: var(--text-primary);
          color: #000;
          box-shadow: 0 4px 14px rgba(255,255,255,0.15);
        }

        .premium-btn.primary:hover {
          transform: translateY(-2px);
          background: #fff;
          box-shadow: 0 6px 20px rgba(255,255,255,0.25);
        }

        .premium-btn.secondary {
          background: rgba(255,255,255,0.05);
          color: var(--text-primary);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .premium-btn.secondary:hover {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.2);
          transform: translateY(-2px);
        }

        /* ── HERO VISUAL COMPOSITION ── */
        .premium-hero-visual {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
        }

        .visual-card-stack {
          position: relative;
          width: 320px;
          height: 440px;
        }

        .v-card {
          position: absolute;
          border-radius: 20px;
          background: #1a1a24;
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
          transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .v-card-back {
          inset: 20px -20px -20px 20px;
          background: #14141c;
          transform: rotate(6deg) scale(0.9);
          opacity: 0.5;
        }
        
        .visual-card-stack:hover .v-card-back { transform: rotate(10deg) scale(0.9) translate(10px, 10px); }

        .v-card-middle {
          inset: 10px -10px -10px 10px;
          background: #171720;
          transform: rotate(3deg) scale(0.95);
          opacity: 0.8;
        }
        
        .visual-card-stack:hover .v-card-middle { transform: rotate(5deg) scale(0.95) translate(5px, 5px); }

        .v-card-front {
          inset: 0;
          background: #1d1d29;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          padding: 1rem;
          gap: 1rem;
        }
        
        .visual-card-stack:hover .v-card-front { transform: translateY(-8px); }

        .v-card-image {
          flex: 1;
          border-radius: 12px;
          background: linear-gradient(145deg, #2a2a3b 0%, #1a1a24 100%);
          position: relative;
          overflow: hidden;
        }

        .v-card-image::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 50%, transparent 100%);
          animation: shimmer 2s infinite;
        }

        .v-card-info {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          padding-bottom: 0.5rem;
        }

        .v-skel {
          height: 12px;
          border-radius: 6px;
          background: #333344;
        }
        .v-skel-title { width: 80%; }
        .v-skel-sub { width: 50%; background: #2a2a35; }

        @media (max-width: 968px) {
          .premium-hero {
            grid-template-columns: 1fr;
            padding: 3rem 2rem;
            text-align: center;
          }
          .premium-hero-content { align-items: center; }
          .premium-hero-visual { display: none; }
        }

        /* ── PREMIUM SECTION ── */
        .premium-section {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .premium-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .premium-section-title {
          font-family: 'Outfit', sans-serif;
          font-size: 1.8rem;
          font-weight: 700;
          margin: 0;
          color: #fff;
        }
        
        .premium-section-title-small {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0;
          color: var(--text-secondary);
        }

        /* ── HORIZONTAL SCROLLER ── */
        .premium-horizontal-scroll {
          display: flex;
          gap: 1.5rem;
          overflow-x: auto;
          padding-bottom: 2rem;
          margin-bottom: -1rem;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
        }

        .premium-horizontal-scroll::-webkit-scrollbar {
          height: 6px;
        }
        .premium-horizontal-scroll::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.02);
          border-radius: 99px;
        }
        .premium-horizontal-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 99px;
        }

        .premium-card {
          flex: 0 0 240px;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          scroll-snap-align: start;
        }

        .real-card { cursor: pointer; }

        .premium-card-cover {
          width: 100%;
          aspect-ratio: 2 / 3;
          border-radius: 16px;
          background: #111116;
          box-shadow: 0 15px 35px -5px rgba(0,0,0,0.5);
          border: 1px solid rgba(255,255,255,0.05);
          position: relative;
          overflow: hidden;
          transition: transform 0.4s ease, box-shadow 0.4s ease;
        }

        .real-card:hover .premium-card-cover {
          transform: translateY(-8px);
          box-shadow: 0 20px 40px -5px rgba(0,0,0,0.8);
          border-color: rgba(255,255,255,0.15);
        }

        .premium-card-cover img {
          width: 100%; height: 100%; object-fit: cover;
          transition: transform 0.6s ease;
        }

        .real-card:hover .premium-card-cover img {
          transform: scale(1.05);
        }

        .place-bg {
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, #151520 0%, #0a0a10 100%);
          font-size: 4rem;
          font-weight: 800;
          color: rgba(255,255,255,0.05);
        }

        .premium-card-badge {
          position: absolute;
          top: 12px; left: 12px;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(8px);
          padding: 4px 10px;
          border-radius: 8px;
          font-size: 0.7rem;
          font-weight: 700;
          color: #fff;
          border: 1px solid rgba(255,255,255,0.1);
        }

        .premium-card-body {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .premium-card-body h4 {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 600;
          color: #fff;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .premium-card-body p {
          margin: 0;
          font-size: 0.85rem;
          color: var(--text-secondary);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.4;
        }

        .ep-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--accent);
          margin-top: 0.2rem;
        }

        /* ── SKELETON DETAILS ── */
        .skel-line { height: 12px; border-radius: 6px; background: #1a1a24; }
        .main-skel { width: 85%; }
        .sub-skel { width: 60%; background: #14141c; }
        .shimmer {
          position: relative; overflow: hidden;
        }
        .shimmer::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent);
          transform: translateX(-100%);
          animation: shimmer 2s infinite;
        }

        /* ── EMPTY STATE DESIGN ── */
        .premium-empty-banner {
          background: #111116;
          border: 1px dashed rgba(255,255,255,0.1);
          border-radius: 24px;
          padding: 4rem 2rem;
          display: flex;
          justify-content: center;
          align-items: center;
          text-align: center;
        }

        .empty-banner-inner {
          max-width: 480px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
        }

        .empty-visual {
          width: 80px; height: 80px;
          background: rgba(45,212,191,0.05);
          border-radius: 24px;
          border: 1px solid rgba(45,212,191,0.1);
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 0.5rem;
        }

        .cube {
          width: 32px; height: 32px;
          border: 2px solid var(--accent);
          border-radius: 8px;
          transform: rotate(45deg);
        }

        .empty-content h4 {
          font-size: 1.4rem; font-weight: 700; color: #fff; margin: 0 0 0.5rem;
        }
        
        .empty-content p {
          font-size: 1rem; color: var(--text-secondary); margin: 0; line-height: 1.5;
        }

        .publish-btn {
          margin-top: 1rem;
        }

        /* ── GENRE ROW ── */
        .premium-genre-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        .premium-chip {
          padding: 0.6rem 1.4rem;
          border-radius: 999px;
          background: #111116;
          border: 1px solid rgba(255,255,255,0.05);
          color: var(--text-secondary);
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: var(--transition);
        }

        .premium-chip:hover {
          background: rgba(255,255,255,0.05);
          color: #fff;
          border-color: rgba(255,255,255,0.1);
          transform: translateY(-2px);
        }

        /* Series Page */
        .series-page {
          max-width: 1100px;
          margin: 0 auto;
          width: 100%;
          padding: 4rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 4rem;
        }

        .series-header {
          display: flex;
          gap: 4rem;
          align-items: flex-start;
        }

        .series-cover-large {
          width: 320px;
          aspect-ratio: 3 / 4;
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: 0 40px 80px rgba(0,0,0,0.6);
          flex-shrink: 0;
          background: var(--bg-surface);
        }

        .series-cover-large img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .series-header-info {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          padding-top: 1rem;
        }

        .series-genre {
          font-size: 0.9rem;
          font-weight: 800;
          color: var(--accent);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .series-header-info h2 {
          font-family: 'Outfit', sans-serif;
          font-size: 3.5rem;
          margin: 0;
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .series-header-info p {
          font-size: 1.2rem;
          color: var(--text-secondary);
          line-height: 1.6;
          max-width: 700px;
        }

        .read-btn {
          background: #fff;
          color: #000;
          border: none;
          padding: 1.25rem 3rem;
          border-radius: 999px;
          font-size: 1.1rem;
          font-weight: 800;
          cursor: pointer;
          transition: var(--transition);
          width: fit-content;
        }

        .read-btn:hover:not(:disabled) {
          transform: scale(1.05);
          box-shadow: 0 10px 30px rgba(255,255,255,0.2);
        }

        .episode-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          border-top: 1px solid var(--border-subtle);
          padding-top: 3rem;
        }

        .episode-item {
          display: grid;
          grid-template-columns: 80px 1fr 140px;
          align-items: center;
          padding: 1.5rem;
          background: var(--bg-surface);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: var(--transition);
          border: 1px solid transparent;
        }

        .episode-item:hover {
          background: var(--bg-elevated);
          border-color: var(--border-subtle);
          transform: translateX(10px);
        }

        .episode-number {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text-dim);
          opacity: 0.5;
        }

        .episode-title {
          font-size: 1.1rem;
          font-weight: 600;
        }

        .episode-date {
          text-align: right;
          color: var(--text-dim);
          font-size: 0.9rem;
        }

        /* Vertical Scroll Reader */
        .reader-view {
          background: #000;
          min-height: 100vh;
        }

        .reader-header {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(20px);
          padding: 1.5rem 3rem;
          display: flex;
          align-items: center;
          gap: 2rem;
          border-bottom: 1px solid #111;
        }

        .back-btn {
          background: #111;
          border: 1px solid #222;
          color: #fff;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: var(--transition);
        }

        .back-btn:hover {
          background: #222;
        }

        .reader-title h2 {
          font-family: 'Outfit', sans-serif;
          font-size: 1.25rem;
          margin: 0;
        }

        .reader-content {
          max-width: 900px;
          margin: 0 auto;
        }

        .reader-scene {
          position: relative;
        }

        .reader-image {
          width: 100%;
          display: block;
        }

        .reader-text {
          padding: 4rem 3rem;
          font-size: 1.4rem;
          line-height: 1.8;
          color: #fff;
          max-width: 800px;
          margin: 0 auto;
          text-align: center;
        }

        /* Animations */
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default App;
