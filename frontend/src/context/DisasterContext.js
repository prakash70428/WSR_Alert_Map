import { createContext, useContext, useEffect, useMemo, useState ,useCallback } from 'react';
import { getAllActiveDisasters, getDisastersByType } from '../services/nasaApi';

const DisasterContext = createContext(undefined);

export function DisasterProvider({ children }) {
  const [disasters, setDisasters] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        },
        (error) => {
          console.warn('Unable to access user location:', error);
        }
      );
    }
  }, []);

  useEffect(() => {
    fetchDisasters();
    const interval = setInterval(fetchDisasters, 5 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // const fetchDisasters = async () => {
  //   setIsLoading(true);
  //   try {
  //     const data = await getAllActiveDisasters();
  //     setDisasters(data);
  //     setLastUpdated(new Date());
  //   } catch (error) {
  //     console.error('Failed to load NASA disaster data:', error);
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  const fetchDisasters = useCallback(async () => {
  setIsLoading(true);
  try {
    const data = await getAllActiveDisasters();
    setDisasters(data);
    setLastUpdated(new Date());
  } catch (error) {
    console.error('Failed to load NASA disaster data:', error);
  } finally {
    setIsLoading(false);
  }
}, []);

  // const getDisastersNearLocation = (lat, lon, radiusMiles = 100) => {
  //   return disasters
  //     .map((disaster) => {
  //       if (!disaster.coordinates) return null;
  //       const distance = calculateDistance(
  //         lat,
  //         lon,
  //         disaster.coordinates.lat,
  //         disaster.coordinates.lon
  //       );
  //       return { ...disaster, distance };
  //     })
  //     .filter((item) => item && item.distance <= radiusMiles)
  //     .sort((a, b) => a.distance - b.distance);
  // };

  const getDisastersNearLocation = useCallback((lat, lon, radiusMiles = 100) => {
  return disasters
    .map((disaster) => {
      if (!disaster.coordinates) return null;
      const distance = calculateDistance(
        lat,
        lon,
        disaster.coordinates.lat,
        disaster.coordinates.lon
      );
      return { ...disaster, distance };
    })
    .filter((item) => item && item.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);
}, [disasters]);

  const getDisastersByTypeHelper = async (category, lat, lon, radiusMiles = 50) => {
    return getDisastersByType(category, lat, lon, radiusMiles);
  };

  const contextValue = useMemo(
    () => ({
      disasters,
      userLocation,
      isLoading,
      lastUpdated,
      fetchDisasters,
      getDisastersNearLocation,
      getDisastersByType: getDisastersByTypeHelper
    }),
    [disasters, userLocation, isLoading, lastUpdated,fetchDisasters,getDisastersNearLocation]
  );

  return <DisasterContext.Provider value={contextValue}>{children}</DisasterContext.Provider>;
}

export function useDisasters() {
  const context = useContext(DisasterContext);
  if (!context) {
    throw new Error('useDisasters must be used within a DisasterProvider');
  }
  return context;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

