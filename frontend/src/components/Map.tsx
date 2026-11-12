import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-rotate';
import './Map.css';
import { BoatState, Waypoint } from '../types';
import { createBoatMarker, createBoatIcon } from './Boat';
import NavigationDisplay from './NavigationDisplay';

interface MapProps {
  boatState: BoatState;
  waypoints: Waypoint[];
  // Scenario editor: right-click / press-and-hold adds, drag moves, click selects.
  editMode?: boolean;
  editWaypoints?: Waypoint[];
  selectedWaypoint?: number | null;
  onAddWaypoint?: (lat: number, lon: number) => void;
  onSelectWaypoint?: (index: number) => void;
  onMoveWaypoint?: (index: number, lat: number, lon: number) => void;
}

function waypointIcon(label: number, selected: boolean) {
  const bg = selected ? '#ff9800' : '#1976d2';
  return L.divIcon({
    className: 'edit-waypoint-icon',
    html: `<div style="width:24px;height:24px;border-radius:12px;background:${bg};color:#fff;
             border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.6);font:bold 12px/20px sans-serif;
             text-align:center;">${label}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// Update the interface definition
declare module 'leaflet' {
  interface MapOptions {
    rotate?: boolean;
    rotateControl?: boolean | {
      closeOnZeroBearing: boolean;
      position: string;
      buttonOptions?: {
        states: { stateName: string; icon: string; title: string }[];
      };
    };
  }

  interface Map {
    setBearing(bearing: number): void;
    getBearing(): number;
  }
}

// Update the interface definition
declare module 'leaflet' {
  interface MapOptions {
    rotate?: boolean;
    rotateControl?: boolean | {
      closeOnZeroBearing: boolean;
      position: string;
      buttonOptions?: {
        states: { stateName: string; icon: string; title: string }[];
      };
    };
  }

  interface Map {
    setBearing(bearing: number): void;
    getBearing(): number;
  }
}

const Map: React.FC<MapProps> = ({
  boatState,
  waypoints,
  editMode = false,
  editWaypoints = [],
  selectedWaypoint = null,
  onAddWaypoint,
  onSelectWaypoint,
  onMoveWaypoint,
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const waypointLayerRef = useRef<L.LayerGroup | null>(null);
  const [isHeadsUp, setIsHeadsUp] = useState(false);

  // Latest editor state/callbacks for Leaflet handlers registered once.
  const editRef = useRef({ editMode, onAddWaypoint, onSelectWaypoint, onMoveWaypoint });
  editRef.current = { editMode, onAddWaypoint, onSelectWaypoint, onMoveWaypoint };

  // Add public method to refresh map
  const refreshMap = () => {
    if (mapRef.current) {
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 300);
    }
  };

  // Expose the refresh method to parent components
  useEffect(() => {
    if (window) {
      // @ts-ignore - Adding to window for global access
      window.refreshMap = refreshMap;
    }
    return () => {
      // @ts-ignore - Cleanup
      delete window.refreshMap;
    };
  }, []);

  // Initialize map with rotation support
  useEffect(() => {
    mapRef.current = L.map('map', {
      rotate: true,
      rotateControl: false,
      tapHold: true,           // press-and-hold on touch screens fires 'contextmenu'
    } as L.MapOptions).setView([0, 0], 12);

    // Editor: right-click (or press and hold) adds a waypoint at the end of the route.
    mapRef.current.on('contextmenu', (e: L.LeafletMouseEvent) => {
      const { editMode: editing, onAddWaypoint: add } = editRef.current;
      if (editing && add) add(e.latlng.lat, e.latlng.lng);
    });

    // Create custom rotation control
    const RotationControl = L.Control.extend({
      onAdd: function() {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const button = L.DomUtil.create('a', 'leaflet-control-rotation', container);
        button.innerHTML = '⇧';
        button.href = '#';
        button.title = 'Toggle Heads Up/North Up';
        
        L.DomEvent.on(button, 'click', (e) => {
          L.DomEvent.preventDefault(e);
          L.DomEvent.stopPropagation(e);
          setIsHeadsUp(prev => {
            button.innerHTML = !prev ? 'N' : '⇧';
            button.classList.toggle('heads-up', !prev);
            return !prev;
          });
        });
        
        return container;
      }
    });

    new RotationControl({ position: 'topleft' }).addTo(mapRef.current);

    // Add rotation event handler
    mapRef.current.on('rotate', () => {
      setIsHeadsUp(mapRef.current?.getBearing() !== 0);
    });

    // Base map layer (OpenStreetMap)
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(mapRef.current);

    // OpenSeaMap layer
    const seamapLayer = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      attribution: '© OpenSeaMap contributors'
    }).addTo(mapRef.current);

    // Add layer control
    const baseLayers = {
      "OpenStreetMap": osmLayer
    };
    
    const overlays = {
      "Sea Marks": seamapLayer
    };

    L.control.layers(baseLayers, overlays).addTo(mapRef.current);

    // Create boat marker
    markerRef.current = createBoatMarker({ 
      lat: 0, 
      lon: 0, 
      heading: 0, 
      speed_mps: 0,
      iconSize: [24, 24],  // Increased from default size
    }).addTo(mapRef.current);
    
    // Create waypoint layer group
    waypointLayerRef.current = L.layerGroup().addTo(mapRef.current);

    // Cleanup
    return () => {
      if (markerRef.current && mapRef.current) {
        mapRef.current.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if (waypointLayerRef.current) {
        waypointLayerRef.current.clearLayers();
      }
    };
  }, []);

  // Update boat position and rotation
  useEffect(() => {
    if (markerRef.current && mapRef.current) {
      const newPos: L.LatLngExpression = [boatState.lat, boatState.lon];
      markerRef.current.setLatLng(newPos);
      
      if (isHeadsUp) {
        mapRef.current.setBearing(-boatState.heading);
        markerRef.current.setIcon(createBoatIcon(0));
      } else {
        mapRef.current.setBearing(0);
        markerRef.current.setIcon(createBoatIcon(boatState.heading));
      }
      
      // Don't drag the view to the boat while editing a route.
      if (!editRef.current.editMode) mapRef.current.panTo(newPos);
    }
  }, [boatState, isHeadsUp]);

  // Editor: draw the draft route with numbered, draggable waypoints.
  useEffect(() => {
    const layer = waypointLayerRef.current;
    if (!editMode || !layer || !mapRef.current) return;
    layer.clearLayers();

    if (editWaypoints.length > 1) {
      L.polyline(editWaypoints.map(wp => [wp.lat, wp.lon] as L.LatLngTuple),
        { color: '#1976d2', weight: 3, opacity: 0.8 }).addTo(layer);
    }

    editWaypoints.forEach((wp, index) => {
      const marker = L.marker([wp.lat, wp.lon], {
        icon: waypointIcon(index + 1, index === selectedWaypoint),
        draggable: true,
        bubblingMouseEvents: false,
        zIndexOffset: index === selectedWaypoint ? 1000 : 0,
      } as L.MarkerOptions);
      marker.bindTooltip(wp.name || `Waypoint ${index + 1}`);
      marker.on('click', () => editRef.current.onSelectWaypoint?.(index));
      marker.on('contextmenu', (e) => L.DomEvent.stopPropagation(e as unknown as Event));
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        editRef.current.onMoveWaypoint?.(index, pos.lat, pos.lng);
        editRef.current.onSelectWaypoint?.(index);
      });
      marker.addTo(layer);
    });
  }, [editMode, editWaypoints, selectedWaypoint]);

  // Entering the editor on an existing route: show the whole route.
  const wasEditing = useRef(false);
  useEffect(() => {
    if (editMode && !wasEditing.current && mapRef.current && editWaypoints.length > 1) {
      mapRef.current.fitBounds(L.latLngBounds(editWaypoints.map(wp => [wp.lat, wp.lon] as L.LatLngTuple)), { padding: [40, 40] });
    }
    wasEditing.current = editMode;
  }, [editMode, editWaypoints]);

  useEffect(() => {
    if (editMode) return;
    if (waypointLayerRef.current && mapRef.current) {
      waypointLayerRef.current.clearLayers();

      // Draw lines between waypoints
      if (waypoints.length > 1) {
        L.polyline(
          waypoints.map(wp => [wp.lat, wp.lon]),
          { color: 'rgba(100, 100, 100, 0.5)', weight: 2, dashArray: '5, 10' }
        ).addTo(waypointLayerRef.current);
      }

      // Add waypoint markers
      waypoints.forEach((waypoint, index) => {
        L.circleMarker([waypoint.lat, waypoint.lon], {
          radius: 6,
          fillColor: '#ff4444',
          color: '#000',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8
        })
        .bindTooltip(`Waypoint ${index + 1}`)
        .addTo(waypointLayerRef.current!);
      });
    }
  }, [waypoints, editMode]);

  return (
    <div id="map">
      <div className="floating-nav-container">
        <NavigationDisplay boatState={boatState} />
      </div>
    </div>
  );
};

export default Map;