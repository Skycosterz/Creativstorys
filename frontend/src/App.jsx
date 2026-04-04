import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { useAvatarGeneration } from './hooks/useAvatarGeneration';
import { apiUrl, resolveAssetUrl } from './config';

const STATUS_LABELS = {
  in_progress: 'En curso',
  paused: 'Pausada',
  completed: 'Terminada',
  archived: 'Archivada',
  published: 'Publicada',
  draft: 'Borrador',
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
  const [activeView, setActiveView] = useState('home');
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

  const [isExporting, setIsExporting] = useState(false);
  const [comicPreviewUrl, setComicPreviewUrl] = useState(null);
  const [comicLayout, setComicLayout] = useState('horizontal');
  const [comicError, setComicError] = useState(null);
  const [showComicModal, setShowComicModal] = useState(false);
  const [upgradeNeeded, setUpgradeNeeded] = useState(null);

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
          fetch(apiUrl('/characters')),
          fetch(apiUrl('/stories')),
        ]);

        const charactersData = await charactersRes.json();
        const storiesData = await storiesRes.json();

        const safeCharacters = Array.isArray(charactersData) ? charactersData : [];
        const safeStories = Array.isArray(storiesData)
          ? storiesData.map(normalizeStory)
          : [];

        setCharacters(safeCharacters);
        setStories(safeStories);

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
  }, []);

  useEffect(() => {
    if (activeView === 'home') {
      fetch(apiUrl('/home/stories'))
        .then((res) => res.json())
        .then((data) => setHomeFeed(Array.isArray(data) ? data : []))
        .catch((err) => console.error(err));
    }
  }, [activeView]);

  useEffect(() => {
    if (activeView === 'series' && viewedSeriesId) {
      fetch(apiUrl(`/series/${viewedSeriesId}`))
        .then((res) => res.json())
        .then((data) => setSeriesData(data))
        .catch((err) => console.error(err));
    }
  }, [activeView, viewedSeriesId]);

  useEffect(() => {
    if (activeView === 'reader' && viewedEpisodeId) {
      fetch(apiUrl(`/episodes/${viewedEpisodeId}`))
        .then((res) => res.json())
        .then((data) => setReaderData(data))
        .catch((err) => console.error(err));
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
        const res = await fetch(apiUrl(`/stories/${selectedStoryId}`));
        const data = await res.json();

        setStoryLog(Array.isArray(data.log) ? data.log : []);
        setWorldState(data.worldState || {});
        setStoryTitle(data.title || '');

        if (data?.worldState?.genre) setGenre(data.worldState.genre);
        if (data?.worldState?.scenario) setScenario(data.worldState.scenario);

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

  useEffect(() => {
    const hasPendingImages = storyLog.some((scene) => scene.imageStatus === 'pending');
    let intervalId;

    if (hasPendingImages && selectedStoryId) {
      intervalId = setInterval(async () => {
        try {
          const res = await fetch(apiUrl(`/stories/${selectedStoryId}`));
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
    setUpgradeNeeded(null);

    try {
      const res = await fetch(apiUrl('/characters'), {
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
          message:
            data.message ||
            'Has alcanzado el límite de personajes permitidos en tu plan actual.',
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
      const res = await fetch(apiUrl('/stories/start'), {
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
      const res = await fetch(apiUrl(`/stories/${editingStory.id}`), {
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
      const res = await fetch(apiUrl(`/stories/${storyId}`), {
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
    setInput('');
  }

  async function handleContinueStory(event) {
    event.preventDefault();
    if (!selectedStoryId || !input.trim()) return;

    setLoading((prev) => ({ ...prev, continueStory: true }));

    try {
      const res = await fetch(apiUrl(`/stories/${selectedStoryId}/continue`), {
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

  async function handleExportComic() {
    if (!selectedStoryId) return;

    setIsExporting(true);
    setComicError(null);
    setComicPreviewUrl(null);
    setShowComicModal(true);

    try {
      const res = await fetch(apiUrl(`/stories/${selectedStoryId}/comic-strip`), {
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
              <section className="home-hero-section">
                <span className="hero-eyebrow">Plataforma Editorial</span>
                <h1 className="hero-title">El hogar de las mejores historias</h1>
                <p className="hero-supporting">
                  Descubre narraciones inmersivas creadas por nuestra comunidad y potenciadas con
                  IA. Una nueva era de storytelling interactivo.
                </p>

                <div className="hero-actions">
                  <button
                    className="pill-btn primary"
                    onClick={() => {
                      setActiveView('studio');
                      setShowCreateStory(true);
                    }}
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

              <section className="home-content-section">
                <h2 className="section-heading">Populares de hoy</h2>

                {homeFeed.length === 0 ? (
                  <div className="empty-state-card">
                    <div className="empty-icon-wrapper">
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>

                    <h3 className="empty-state-title">Sé el primero en publicar</h3>
                    <p className="empty-state-text">
                      Nuestra comunidad está esperando nuevas historias. Empieza a crear la tuya y
                      descubre todo lo que puedes lograr.
                    </p>

                    <button
                      className="pill-btn outline"
                      onClick={() => {
                        setActiveView('studio');
                        setShowCreateStory(true);
                      }}
                    >
                      Crear mi historia
                    </button>
                  </div>
                ) : (
                  <div className="feed-grid">
                    {homeFeed.map((story) => (
                      <article
                        key={story.id}
                        className="story-card"
                        onClick={() => {
                          setViewedSeriesId(story.id);
                          setActiveView('series');
                        }}
                      >
                        <div className="story-card-inner">
                          <div className="story-card-thumbnail">
                            {story.coverImageUrl ? (
                              <img
                                src={resolveAssetUrl(story.coverImageUrl)}
                                alt={story.title}
                                className="story-thumbnail"
                              />
                            ) : (
                              <div className="story-thumbnail-placeholder">
                                {story.title?.charAt(0)?.toUpperCase()}
                              </div>
                            )}
                          </div>

                          <div className="story-card-info">
                            <h3 className="story-card-title">{story.title}</h3>
                            <p className="story-card-preview">
                              {truncateText(story.synopsis || 'Sinopsis pendiente', 120)}
                            </p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {homeFeed.length === 0 && (
                <section className="home-content-section">
                  <h2 className="section-heading">Explorar historias</h2>
                  <div className="genre-chip-row">
                    {[
                      'Fantasía',
                      'Ciencia Ficción',
                      'Romance',
                      'Terror',
                      'Aventura',
                      'Misterio',
                      'Acción',
                      'Drama',
                      'Comedia',
                    ].map((item) => (
                      <div key={item} className="genre-chip">
                        {item}
                      </div>
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
                  <img
                    src={resolveAssetUrl(seriesData.coverImageUrl)}
                    alt={seriesData.title}
                  />
                ) : (
                  <div className="series-cover-placeholder">P</div>
                )}
              </div>

              <div className="series-header-info">
                <span className="series-genre">{seriesData.genre || 'Fantasia'}</span>
                <h2>{seriesData.title}</h2>
                <p>{seriesData.synopsis || 'Esta historia no tiene sinopsis.'}</p>

                <div className="series-actions">
                  {seriesData.episodes?.length > 0 ? (
                    <button
                      className="read-btn"
                      onClick={() => {
                        setViewedEpisodeId(seriesData.episodes[0].id);
                        setActiveView('reader');
                      }}
                    >
                      LEER EP. 1
                    </button>
                  ) : (
                    <button className="read-btn" disabled>
                      PROXIMAMENTE
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="series-episodes">
              <h3>Episodios ({seriesData.episodes?.length || 0})</h3>

              <div className="episode-list">
                {seriesData.episodes?.length === 0 && (
                  <p className="empty-state">Aun no hay episodios.</p>
                )}

                {(seriesData.episodes || []).map((ep) => (
                  <div
                    key={ep.id}
                    className="episode-item"
                    onClick={() => {
                      setViewedEpisodeId(ep.id);
                      setActiveView('reader');
                    }}
                  >
                    <div className="episode-number">#{ep.episodeNumber}</div>
                    <div className="episode-title">{ep.title}</div>
                    <div className="episode-date">
                      {ep.publishedAt
                        ? new Date(ep.publishedAt).toLocaleDateString()
                        : 'Reciente'}
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
              <button className="back-btn" onClick={() => setActiveView('series')}>
                &larr; Volver a Serie
              </button>

              <div className="reader-title">
                <span>{readerData.storyTitle}</span>
                <h2>{readerData.title}</h2>
              </div>
            </div>

            <div className="reader-content">
              {(readerData.scenes || []).map((scene, idx) => (
                <div key={idx} className="reader-scene">
                  {scene.imageUrl && (
                    <img
                      src={resolveAssetUrl(scene.imageUrl)}
                      alt="Scene"
                      className="reader-image"
                    />
                  )}
                  <p className="reader-text">{scene.text}</p>
                </div>
              ))}
            </div>

            <div className="reader-footer">
              <button className="back-btn" onClick={() => setActiveView('series')}>
                Volver a la Lista de Episodios
              </button>
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
                        className={`filter-chip ${statusFilter === filter.value ? 'active' : ''}`}
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
                        const badgeClass =
                          story.status === 'completed'
                            ? 'completed'
                            : story.status === 'paused'
                              ? 'paused'
                              : story.status === 'archived'
                                ? 'archived'
                                : 'progress';

                        return (
                          <article
                            key={story.id}
                            className={`story-card ${isActive ? 'active' : ''}`}
                            onClick={() => handleSelectStory(story.id)}
                          >
                            <div className="story-card-inner">
                              <div className="story-card-thumbnail">
                                {story.coverImageUrl ? (
                                  <img
                                    src={resolveAssetUrl(story.coverImageUrl)}
                                    alt={story.title}
                                    className="story-thumbnail"
                                  />
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
                                <h3 className="story-card-title">
                                  {story.title || `Historia ${story.id}`}
                                </h3>

                                <p className="story-card-preview">{preview}</p>

                                <div className="story-card-meta">
                                  <span>
                                    {story.messageCount} episodios ·{' '}
                                    {formatRelativeTime(story.lastActivityAt)}
                                  </span>

                                  <div className="story-hover-actions">
                                    <button
                                      type="button"
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
                                      type="button"
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
                                      type="button"
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
                      <h2 className="roleplay-title-active">
                        {displayedStoryTitle || 'Selecciona una historia'}
                      </h2>

                      {worldState?.arc && (
                        <div className="minimal-arc">
                          <span className="arc-step">
                            {worldState.arc.nextBeat || 'Explorar'}
                          </span>
                          <div className="arc-bar-mini">
                            <div
                              className="arc-fill-mini"
                              style={{ width: `${worldState.arc.progress || 0}%` }}
                            />
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
                            type="button"
                            className="comic-export-btn"
                            onClick={handleExportComic}
                            disabled={isExporting}
                            title="Exportar escenas como cómic"
                          >
                            {isExporting ? (
                              <>
                                <span className="comic-spinner" /> Generando…
                              </>
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
                          {!isLatest && <div className="scene-divider" />}

                          <div className="scene-body">
                            {scene.chapter && (
                              <span className="scene-chapter-badge">Cap {scene.chapter}</span>
                            )}

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
                              <div className="scene-image-skeleton shimmering" />
                              <span className="scene-image-loading-text">
                                Capturando momento cinematográfico...
                              </span>
                            </div>
                          )}

                          {scene.imageStatus === 'ready' && scene.imageUrl && (
                            <div className="scene-image-wrapper">
                              <img
                                src={resolveAssetUrl(scene.imageUrl)}
                                alt="Momento cinematográfico"
                                className="scene-image"
                              />
                            </div>
                          )}

                          {scene.imageStatus === 'error' && (
                            <p className="scene-image-error">
                              No se pudo capturar la imagen.
                            </p>
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
                    <p className="page-subtitle">
                      Gestiona el elenco y las identidades visuales de tus historias.
                    </p>
                  </div>

                  <div className="characters-grid">
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

                        {upgradeNeeded && (
                          <div className="upgrade-needed-box">
                            <div className="upgrade-icon">🚀</div>
                            <div className="upgrade-content">
                              <h4>{upgradeNeeded.title}</h4>
                              <p>{upgradeNeeded.message}</p>
                              <button
                                type="button"
                                className="pill-btn accent compact"
                                onClick={() => alert('Próximamente: Integración con Stripe')}
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

                    <div className="character-list-container">
                      {characters.length === 0 && (
                        <div className="empty-state-card list-empty">
                          <h4 className="empty-state-title">Aún no hay personajes</h4>
                          <p className="empty-state-text">
                            Empieza agregando un personaje en el panel izquierdo.
                          </p>
                        </div>
                      )}

                      {avatarError && (
                        <div className="error-banner">
                          <span className="error-icon">⚠️</span> Error al generar avatar:{' '}
                          {avatarError}
                        </div>
                      )}

                      <div className="character-list">
                        {characters.map((character) => {
                          const isActive =
                            String(character.id) === String(selectedCharacterId);
                          const isGeneratingThis =
                            avatarLoading &&
                            String(character.id) === String(selectedCharacterId);

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
                                    src={resolveAssetUrl(character.avatarUrl)}
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

      {showComicModal && (
        <div className="modal-backdrop" onClick={handleCloseComicModal}>
          <div className="comic-modal" onClick={(e) => e.stopPropagation()}>
            <div className="comic-modal-header">
              <h3 className="comic-modal-title">🎨 Cómic exportado</h3>
              <button className="comic-modal-close" onClick={handleCloseComicModal}>
                ✕
              </button>
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
                    type="button"
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
    </div>
  );
}

export default App;