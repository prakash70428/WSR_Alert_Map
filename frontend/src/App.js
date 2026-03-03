import React, { useEffect, useState } from 'react';
import './App.css';
import Header from './components/Header/Header';
import Dashboard from './components/Dashboard/Dashboard';
import MapView from './components/Map/MapView';
import AlertPanel from './components/Alerts/AlertPanel';
import AlertBanner from './components/Alerts/AlertBanner';
import LayerControl from './components/Layers/LayerControl';
import Chatbot from './components/Chatbot/Chatbot';
import {
  fetchWildfires,
  fetchAirQuality,
  fetchWindData,
  fetchAlerts
} from './services/api';
import { deriveAlertSummary } from './utils/alerts';

const DEFAULT_LOCATION = { lat: 37.7749, lng: -122.4194 };
const DEFAULT_FIRE_AREA = 'USA_contiguous_and_Hawaii';
const DEFAULT_FIRE_DATASET = 'VIIRS_SNPP_NRT';
const DEFAULT_AIR_RADIUS = 100000;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const createInitialApiStatus = () => ({
  wildfires: { status: 'unknown', count: 0 },
  airQuality: { status: 'unknown', count: 0 },
  alerts: { status: 'unknown' }
});

function App() {
  const [activeTab, setActiveTab] = useState('map');
  const [showLayers, setShowLayers] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [apiStatus, setApiStatus] = useState(createInitialApiStatus);
  const [data, setData] = useState({
    wildfires: [],
    airQuality: [],
    alerts: null
  });
  const [wind, setWind] = useState(null);
  const [error, setError] = useState(null);

  const [layers, setLayers] = useState({
    wildfires: true,
    airQuality: true,
    smokeForecast: false,
    disasters: true
  });
  const [showAlertOverlay, setShowAlertOverlay] = useState(true);

  useEffect(() => {
    // Default to San Francisco so we always have a location quickly.
    setUserLocation(DEFAULT_LOCATION);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (geoError) => {
          console.log('Location access denied or unavailable:', geoError);
        },
        { timeout: 10000 }
      );
    }
  }, []);

  useEffect(() => {
    const location = userLocation || DEFAULT_LOCATION;
    let isMounted = true;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [wildfireData, airQualityData, alertsData, windData] = await Promise.all([
          fetchWildfires({ area: DEFAULT_FIRE_AREA, days: 1, source: DEFAULT_FIRE_DATASET }),
          fetchAirQuality(location.lat, location.lng, DEFAULT_AIR_RADIUS),
          fetchAlerts(location.lat, location.lng, DEFAULT_AIR_RADIUS),
          fetchWindData(location.lat, location.lng)
        ]);

        if (!isMounted) {
          return;
        }

        const transformedWildfires = (wildfireData || []).map((fire, index) => {
          const lat = Number(fire.lat ?? fire.latitude);
          const lng = Number(fire.lng ?? fire.longitude);
          const confidence = fire.confidence ?? 0;
          let severity = fire.severity;
          if (!severity) {
            severity = confidence >= 80 ? 'high' : confidence >= 50 ? 'medium' : 'low';
          }

          return {
            id: fire.id || `fire_${index}`,
            lat,
            lng,
            name: fire.name || fire.title || `Fire ${index + 1}`,
            severity,
            brightness: fire.brightness ?? null,
            confidence,
            frp: fire.frp ?? null,
            acqDate: fire.acqDate || fire.timestamp || null
          };
        });

        const transformedAirQuality = (airQualityData || []).map((station, index) => ({
          id: station.id || `aq_${index}`,
          location: station.location || station.city || `Station ${index + 1}`,
          aqi: station.aqi ?? station.value ?? null,
          status: station.status || station.category || 'unknown',
          lat: station.lat ?? station.latitude ?? null,
          lng: station.lng ?? station.longitude ?? null,
          lastUpdated: station.lastUpdated || station.timestamp || null
        }));

        const alertSummary = deriveAlertSummary({
          wildfires: transformedWildfires,
          airQuality: transformedAirQuality,
          wind: windData,
          userLocation
        });

        const enrichedAlerts = normalizeAlerts(alertSummary, alertsData);

        setData({
          wildfires: transformedWildfires,
          airQuality: transformedAirQuality,
          alerts: enrichedAlerts
        });
        setWind(windData);
        setLastUpdated(new Date());
        setApiStatus({
          wildfires: { status: 'success', count: transformedWildfires.length },
          airQuality: { status: 'success', count: transformedAirQuality.length },
          alerts: { status: alertsData ? 'success' : 'derived' }
        });
      } catch (fetchError) {
        if (!isMounted) {
          return;
        }

        console.error('Failed to load live data', fetchError);
        setError('Unable to load live data. Showing the last available information.');
        setApiStatus({
          wildfires: { status: 'error', usingMock: true },
          airQuality: { status: 'error', usingMock: true },
          alerts: { status: 'error' }
        });
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadData();
    const refreshTimer = setInterval(loadData, REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(refreshTimer);
    };
  }, [userLocation]);

  useEffect(() => {
    setShowLayers(false);
  }, [activeTab]);

  const toggleLayer = (layer) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const hasNearbyAlerts = Boolean(data.alerts?.messages?.length);

  useEffect(() => {
    if (hasNearbyAlerts) {
      setShowAlertOverlay(true);
    }
  }, [hasNearbyAlerts, data.alerts?.messages]);

  if (isLoading && !lastUpdated) {
    return (
      <div className="App mobile-app">
        <div className="app-header-wrapper">
          <Header onLayersClick={() => setShowLayers((prev) => !prev)} />
        </div>
        <div className="mobile-content">
          <div className="loading-screen">
            <div className="loading-spinner">⏳</div>
            <p>Loading real-time data...</p>
          </div>
      </div>
    </div>
  );
  }

  return (
    <div className="App mobile-app">
      <div className="app-header-wrapper">
        <Header onLayersClick={() => setShowLayers((prev) => !prev)} />
      </div>

      <div className="mobile-content">
        {activeTab === 'map' && (
          <div className="map-screen">
            {hasNearbyAlerts && showAlertOverlay && (
              <div className="alert-overlay">
                <AlertBanner alerts={data.alerts} onClose={() => setShowAlertOverlay(false)} />
              </div>
            )}
            <MapView data={data} layers={layers} loading={isLoading} error={error} wind={wind} />
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="dashboard-screen">
            <Dashboard data={data} wind={wind} lastUpdated={lastUpdated} apiStatus={apiStatus} />
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="alerts-screen">
            <AlertPanel alerts={data.alerts} />
          </div>
        )}

        {activeTab === 'chatbot' && (
          <div className="chatbot-screen">
            <Chatbot onClose={() => setActiveTab('map')} />
          </div>
        )}
      </div>

      <div className={`drawer drawer-right ${showLayers ? 'open' : ''}`}>
        <div className="drawer-overlay" onClick={() => setShowLayers(false)} />
        <div className="drawer-content">
          <div className="drawer-header">
            <h2>Map Layers</h2>
            <button className="drawer-close" onClick={() => setShowLayers(false)}>
              ✕
            </button>
          </div>
          <LayerControl layers={layers} onToggle={toggleLayer} />
        </div>
      </div>

      <nav className="bottom-nav">
        <button
          className={`nav-item ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          <span className="nav-icon">🗺️</span>
          <span className="nav-label">Map</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <span className="nav-icon">📊</span>
          <span className="nav-label">Stats</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveTab('alerts')}
        >
          <span className="nav-icon">⚠️</span>
          <span className="nav-label">Alerts</span>
        </button>
      </nav>

      {activeTab !== 'chatbot' && (
        <button
          className="floating-chatbot-button"
          onClick={() => setActiveTab('chatbot')}
          aria-label="Open AI Assistant"
        >
          <span className="chatbot-icon">🤖</span>
        </button>
      )}

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}

function normalizeAlerts(summary, alertsData) {
  const severityRank = ['low', 'moderate', 'high', 'very-high', 'extreme', 'hazardous'];
  const rankOf = (level) => {
    if (!level) return -1;
    const normalized = level.toString().toLowerCase();
    const idx = severityRank.indexOf(normalized);
    return idx >= 0 ? idx : severityRank.indexOf('moderate');
  };

  const defaultRecommendationsByLevel = {
    low: [
      'Conditions are currently safe',
      'Continue to monitor air quality',
      'Have an emergency plan ready'
    ],
    moderate: [
      'Limit prolonged outdoor activities',
      'Monitor air quality every few hours',
      'Check in on sensitive groups nearby'
    ],
    high: [
      'Prepare for potential evacuation',
      'Pack essential documents, medications, and supplies',
      'Check on neighbors and vulnerable family members',
      'Monitor official channels for evacuation guidance'
    ],
    'very-high': [
      'Be ready to evacuate immediately',
      'Keep car fuelled and essential supplies packed',
      'Follow official evacuation orders without delay'
    ],
    extreme: [
      'Evacuate immediately if directed',
      'Avoid outdoor exposure entirely',
      'Stay informed through official emergency alerts'
    ],
    hazardous: [
      'Shelter indoors with clean air or evacuate if possible',
      'Use N95 masks if you must go outside',
      'Stay tuned to emergency broadcasts continuously'
    ]
  };

  const messagesFromApi =
    alertsData?.alerts?.map((alert) => alert.message || alert.title).filter(Boolean) || [];

  const apiLevel = alertsData?.overallRiskLevel;
  const summaryLevel = summary.level || 'moderate';
  const normalizedLevel =
    rankOf(apiLevel) >= rankOf(summaryLevel) ? apiLevel?.toString().toLowerCase() : summaryLevel.toString().toLowerCase();

  const fallbackRecommendations =
    defaultRecommendationsByLevel[normalizedLevel] || defaultRecommendationsByLevel.moderate;

  const recommendations = alertsData?.recommendations?.length ? alertsData.recommendations : fallbackRecommendations;

  return {
    ...summary,
    level: normalizedLevel,
    messages: messagesFromApi.length ? messagesFromApi : summary.messages,
    recommendations
  };
}

export default App;
