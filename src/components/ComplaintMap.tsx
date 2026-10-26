import { useEffect, useRef, useState } from 'react';
import type L from 'leaflet';
import type { Complaint, ComplaintStatus, Priority } from '@/lib/types';

export interface ComplaintMapProps {
  complaints: Complaint[];
  /** Pimpri-Chinchwad center */
  center?: [number, number];
  zoom?: number;
  height?: string;
  /** When true, clicking the map selects a location and calls onSelect. */
  pickable?: boolean;
  onSelect?: (lat: number, lng: number) => void;
  selectedCoord?: { lat: number; lng: number } | null;
  /** When true, show the status/category filters and fit-to-markers button. */
  showControls?: boolean;
  /** When true, clicking a marker opens the complaint popup (default true). */
  showPopups?: boolean;
}

const PC_CENTER: [number, number] = [18.6298, 73.7997];

const STATUS_COLORS: Record<ComplaintStatus, string> = {
  'Submitted': '#3b82f6',
  'Verified': '#06b6d4',
  'Assigned': '#f59e0b',
  'In Progress': '#8b5cf6',
  'Resolved': '#10b981',
  'Rejected': '#ef4444',
};

const PRIORITY_COLORS: Record<Priority, string> = {
  'High': '#ef4444',
  'Medium': '#f59e0b',
  'Low': '#10b981',
};

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function statusDot(color: string): string {
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px;vertical-align:middle;"></span>`;
}

function popupHtml(c: Complaint): string {
  const statusColor = STATUS_COLORS[c.status] || '#6b7280';
  const loc = c.location ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">📍 ${escapeHtml(c.location)}</div>` : '';
  const coord = c.coordinates && (c.coordinates.lat || c.coordinates.lng)
    ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px;">${c.coordinates.lat.toFixed(5)}, ${c.coordinates.lng.toFixed(5)}</div>`
    : '';
  return `
    <div style="min-width:180px;max-width:240px;font-family:inherit;">
      <div style="font-weight:600;font-size:13px;color:#111827;">${escapeHtml(c.id)}</div>
      <div style="font-size:13px;color:#111817;margin-top:2px;">${escapeHtml(c.title)}</div>
      <div style="margin-top:4px;font-size:12px;color:#374151;">${escapeHtml(c.category)}</div>
      <div style="margin-top:4px;font-size:12px;">${statusDot(statusColor)}${escapeHtml(c.status)}</div>
      ${loc}
      ${coord}
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch] as string));
}

export default function ComplaintMap({
  complaints,
  center = PC_CENTER,
  zoom = 13,
  height = '500px',
  pickable = false,
  onSelect,
  selectedCoord = null,
  showControls = false,
  showPopups = true,
}: ComplaintMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const pickMarkerRef = useRef<L.Marker | null>(null);
  const [mapError, setMapError] = useState('');
  const [mapReady, setMapReady] = useState(false);

  // Filter state (only used when showControls)
  const [statusFilter, setStatusFilter] = useState<'All' | ComplaintStatus>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  const statuses: ('All' | ComplaintStatus)[] = ['All', 'Submitted', 'Verified', 'Assigned', 'In Progress', 'Resolved', 'Rejected'];

  const filtered = showControls
    ? complaints.filter((c) => {
        const statusOk = statusFilter === 'All' || c.status === statusFilter;
        const categoryOk = categoryFilter === 'All' || c.category === categoryFilter;
        return statusOk && categoryOk;
      })
    : complaints;

  const geoComplaints = filtered.filter(
    (c) => c.coordinates && (c.coordinates.lat || c.coordinates.lng) && isFinite(c.coordinates.lat) && isFinite(c.coordinates.lng)
  );
  const noCoordCount = filtered.length - geoComplaints.length;

  const categories = Array.from(new Set(complaints.map((c) => c.category).filter(Boolean))).sort();

  // Initialize the map once.
  useEffect(() => {
    let cancelled = false;
    let leafletLib: typeof L | null = null;

    (async () => {
      try {
        // Inject Leaflet CSS once.
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }
        leafletLib = (await import('leaflet')).default as typeof L;
        if (cancelled || !containerRef.current || mapRef.current) return;

        const map = leafletLib.map(containerRef.current, {
          center,
          zoom,
          zoomControl: true,
          attributionControl: true,
        });
        leafletLib.tileLayer(TILE_URL, {
          attribution: TILE_ATTRIBUTION,
          maxZoom: 19,
        }).addTo(map);

        layerRef.current = leafletLib.layerGroup().addTo(map);

        if (pickable && onSelect) {
          map.on('click', (e: L.LeafletMouseEvent) => {
            onSelect(e.latlng.lat, e.latlng.lng);
          });
        }

        mapRef.current = map;
        setMapReady(true);
        // Ensure correct sizing after mount.
        setTimeout(() => map.invalidateSize(), 100);
      } catch (err) {
        setMapError(err instanceof Error ? err.message : 'Failed to load map');
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
        pickMarkerRef.current = null;
        setMapReady(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render markers whenever complaints/filters change.
  useEffect(() => {
    const lib = leafletLibRef.current;
    const layer = layerRef.current;
    if (!lib || !layer || !mapReady) return;
    layer.clearLayers();

    geoComplaints.forEach((c) => {
      const color = STATUS_COLORS[c.status] || PRIORITY_COLORS[c.priority] || '#6b7280';
      const marker = lib.circleMarker([c.coordinates.lat, c.coordinates.lng], {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.9,
      });
      if (showPopups) marker.bindPopup(popupHtml(c));
      marker.addTo(layer);
    });
  }, [geoComplaints, showPopups, mapReady]);

  // Keep a ref to the leaflet lib for the markers effect.
  const leafletLibRef = useRef<typeof L | null>(null);
  useEffect(() => {
    (async () => {
      if (!leafletLibRef.current) {
        leafletLibRef.current = (await import('leaflet')).default as typeof L;
      }
    })();
  }, []);

  // Update pick marker when selectedCoord changes.
  useEffect(() => {
    const lib = leafletLibRef.current;
    const map = mapRef.current;
    if (!lib || !map) return;
    if (pickMarkerRef.current) {
      pickMarkerRef.current.remove();
      pickMarkerRef.current = null;
    }
    if (selectedCoord && (selectedCoord.lat || selectedCoord.lng)) {
      const icon = lib.divIcon({
        className: 'complaint-pick-marker',
        html: '<div style="width:20px;height:20px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      pickMarkerRef.current = lib.marker([selectedCoord.lat, selectedCoord.lng], { icon }).addTo(map);
    }
  }, [selectedCoord]);

  const fitToMarkers = () => {
    const lib = leafletLibRef.current;
    const map = mapRef.current;
    if (!lib || !map || geoComplaints.length === 0) return;
    const bounds = lib.latLngBounds(geoComplaints.map((c) => [c.coordinates.lat, c.coordinates.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.1), { maxZoom: 16 });
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setMapError('Geolocation is not available on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const map = mapRef.current;
        if (map) map.setView([latitude, longitude], 15);
        if (pickable && onSelect) onSelect(latitude, longitude);
      },
      (err) => setMapError(err.message || 'Unable to retrieve your location.'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div className="space-y-3">
      {showControls && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                  statusFilter === s ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1 rounded-md text-xs border border-gray-200 bg-white text-gray-600 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="All">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            onClick={fitToMarkers}
            disabled={geoComplaints.length === 0}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Fit to markers
          </button>
          {pickable && (
            <button
              onClick={useMyLocation}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Use my location
            </button>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-2">
        <div
          ref={containerRef}
          role="application"
          aria-label="Complaint map"
          style={{ height, width: '100%', borderRadius: '0.5rem', overflow: 'hidden', background: '#e5e7eb' }}
        />
        {mapError && (
          <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
            Map could not be loaded: {mapError}. Please check your connection and try again.
          </div>
        )}
        {!mapError && !mapReady && (
          <div className="mt-2 text-xs text-gray-400">Loading map…</div>
        )}
        {mapReady && geoComplaints.length === 0 && (
          <div className="mt-2 text-xs text-gray-500">
            {filtered.length === 0
              ? 'No complaints match the current filters.'
              : `${noCoordCount} complaint(s) have no coordinates and are not shown on the map.`}
          </div>
        )}
        {mapReady && geoComplaints.length > 0 && noCoordCount > 0 && (
          <div className="mt-2 text-xs text-gray-400">
            {noCoordCount} complaint(s) without coordinates are not shown.
          </div>
        )}
      </div>
    </div>
  );
}
