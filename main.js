// Main application namespace to avoid global scope pollution
const RiverApp = {
  // Map instance and layers - Core Leaflet map objects
  map: null,
  sungaiLayer: null,
  
  // Data storage - Arrays and maps to store processed river data
  allFeatures: [],
  normalizedNames: new Map(), // Maps normalized names to original features
  
  // DOM elements cache - Store references to HTML elements for better performance
  elements: {
    map: document.getElementById('map'),
    search: document.getElementById('search'),
    searchBtn: document.getElementById('search-btn'),
    exportBtn: document.getElementById('export-btn'),
    loadingSpinner: document.getElementById('loading-spinner')
  },

  // Mouse interaction state - Prevents flickering during hover events
  isHovering: false,
  hoverTimeout: null,
  currentHighlighted: null,

  // Initialize the application - Main entry point
  init() {
    console.log('Initializing River App...');
    this.showLoading(true);
    this.initMap();
    this.loadData();
    this.setupEventListeners();
  },

  // Initialize the Leaflet map - Sets up the base map with tiles and view
  initMap() {
    console.log('Setting up map...');
    // Create map instance centered on Jabodetabekjur region (Jakarta and surrounding areas)
    this.map = L.map('map').setView([-6.4, 106.8], 10);

    // Add OpenStreetMap tile layer - Provides the background map imagery
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    // Add custom controls - Reset view and toggle layer buttons
    this.addMapControls();
  },

  // Add custom map controls - Creates custom buttons on the map
  addMapControls() {
    // Reset view control - Button to return map to original view
    const resetViewControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
        container.innerHTML = '⟲';
        container.title = 'Reset View';
        container.onclick = () => {
          console.log('Resetting map view');
          this.map.setView([-6.4, 106.8], 10);
        };
        return container;
      }
    });

    // Toggle river layer control - Button to show/hide all rivers
    const toggleLayerControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
        container.innerHTML = '💧';
        container.title = 'Toggle River Layer';
        container.onclick = () => this.toggleRiverLayer();
        return container;
      }
    });

    // Add both controls to the map
    this.map.addControl(new resetViewControl());
    this.map.addControl(new toggleLayerControl());
  },

  // Toggle river layer visibility - Shows or hides all river lines
  toggleRiverLayer() {
    if (this.map.hasLayer(this.sungaiLayer)) {
      console.log('Hiding river layer');
      this.map.removeLayer(this.sungaiLayer);
    } else {
      console.log('Showing river layer');
      this.map.addLayer(this.sungaiLayer);
    }
  },

  // Load GeoJSON data - Fetches river data from external file
  async loadData() {
    console.log('Loading river data...');
    try {
      // Fetch the GeoJSON file containing river data
      const response = await fetch('river.geojson');
      const data = await response.json();
      
      console.log(`Loaded ${data.features.length} river features from GeoJSON`);
      
      // Process and merge features with similar names
      this.processFeatures(data.features);
      
      // Create and add the river layer to map
      this.createRiverLayer();
      
      // Hide loading spinner once everything is loaded
      this.showLoading(false);
      console.log('River data loaded successfully');
    } catch (error) {
      console.error('Error loading GeoJSON:', error);
      this.showLoading(false);
      alert('Error loading river data. Please try refreshing the page.');
    }
  },

  // FIXED: Process and merge features with improved name normalization
  processFeatures(features) {
    console.log('Processing and merging river features...');
    
    // Clear existing data before processing
    this.normalizedNames.clear();
    this.allFeatures = [];

    // Group features by NORMALIZED name with unique ID for unnamed rivers
    const groupedFeatures = new Map();
    let unnamedRiverCounter = 1;
    
    // Process each river feature from the GeoJSON
    features.forEach((feature, index) => {
      const originalName = feature.properties?.name || 'Sungai tanpa nama';
      let groupKey;
      
      // Handle unnamed rivers separately to prevent grouping
      if (!feature.properties?.name || feature.properties.name.trim() === '' || 
          feature.properties.name.toLowerCase().includes('tanpa nama')) {
        // Give each unnamed river a unique identifier
        groupKey = `unnamed_river_${unnamedRiverCounter++}`;
      } else {
        // Use normalized name for named rivers
        groupKey = this.normalizeName(originalName);
      }
      
      // Debug logging for name normalization
      if (index < 20) { // Log first 20 for debugging
        console.log(`Original: "${originalName}" -> Normalized: "${groupKey}"`);
      }
      
      // Group by the key (normalized name or unique ID for unnamed)
      if (!groupedFeatures.has(groupKey)) {
        groupedFeatures.set(groupKey, {
          originalName: originalName,
          features: [],
          isUnnamed: groupKey.startsWith('unnamed_river_')
        });
      }
      groupedFeatures.get(groupKey).features.push(feature);
    });

    console.log(`Grouped ${features.length} features into ${groupedFeatures.size} groups`);

    // Process each group of features
    for (const [groupKey, group] of groupedFeatures) {
      try {
        const riverFeatures = group.features;
        const originalName = group.originalName;
        const isUnnamed = group.isUnnamed;
        let finalFeature;
        
        // Log merging information for debugging
        if (riverFeatures.length > 1 && !isUnnamed) {
          const allNames = [...new Set(riverFeatures.map(f => f.properties?.name).filter(Boolean))];
          console.log(`Merging ${riverFeatures.length} segments for "${originalName}":`, allNames);
        }
        
        if (riverFeatures.length === 1 || isUnnamed) {
          // Single feature or unnamed river - use directly
          finalFeature = riverFeatures[0];
          finalFeature.properties.name = originalName;
          
          // Add unique ID for unnamed rivers to distinguish them
          if (isUnnamed) {
            finalFeature.properties.uniqueId = groupKey;
          }
        } else {
          // Multiple named features - merge them into one connected river
          const validFeatures = riverFeatures.filter(f => 
            f.geometry && 
            (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')
          );

          if (validFeatures.length === 0) {
            console.warn(`No valid geometries for ${originalName}`);
            continue;
          }

          // Try to connect line segments intelligently
          const connectedCoordinates = this.connectLineSegments(validFeatures);

          // Create merged feature with connected geometry
          finalFeature = {
            type: 'Feature',
            properties: {
              name: originalName,
              originalCount: riverFeatures.length,
              normalizedName: this.normalizeName(originalName),
              mergedNames: [...new Set(riverFeatures.map(f => f.properties?.name).filter(Boolean))]
            },
            geometry: {
              type: 'MultiLineString',
              coordinates: connectedCoordinates
            }
          };
        }

        this.allFeatures.push(finalFeature);
      } catch (error) {
        console.warn(`Error processing ${group.originalName}:`, error);
        // Add features individually as fallback if merging fails
        riverFeatures.forEach(feature => {
          this.allFeatures.push(feature);
        });
      }
    }

    // Sort features alphabetically by name for consistent display
    this.allFeatures.sort((a, b) => {
      const nameA = a.properties?.name || '';
      const nameB = b.properties?.name || '';
      return nameA.localeCompare(nameB);
    });

    console.log(`Final result: ${this.allFeatures.length} processed river features`);
  },

  // Intelligently connect line segments to form continuous rivers
  connectLineSegments(features) {
    if (features.length === 1) {
      const geom = features[0].geometry;
      return geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
    }

    // Extract all line segments
    let segments = [];
    features.forEach(feature => {
      if (feature.geometry.type === 'LineString') {
        segments.push(feature.geometry.coordinates);
      } else if (feature.geometry.type === 'MultiLineString') {
        segments = segments.concat(feature.geometry.coordinates);
      }
    });

    if (segments.length <= 1) {
      return segments;
    }

    // Try to connect segments by finding touching endpoints
    const connectedSegments = [];
    const used = new Set();

    // Helper function to check if two points are close (within ~10 meters)
    const arePointsClose = (p1, p2, tolerance = 0.0001) => {
      return Math.abs(p1[0] - p2[0]) < tolerance && Math.abs(p1[1] - p2[1]) < tolerance;
    };

    // Start with the first segment
    let currentSegment = [...segments[0]];
    used.add(0);

    // Try to connect remaining segments
    let foundConnection = true;
    while (foundConnection && used.size < segments.length) {
      foundConnection = false;
      
      const currentStart = currentSegment[0];
      const currentEnd = currentSegment[currentSegment.length - 1];

      // Look for a segment that connects to current segment
      for (let i = 0; i < segments.length; i++) {
        if (used.has(i)) continue;

        const segmentStart = segments[i][0];
        const segmentEnd = segments[i][segments[i].length - 1];

        // Check if this segment connects to the end of current segment
        if (arePointsClose(currentEnd, segmentStart)) {
          // Connect to end: add segment points (skip first duplicate point)
          currentSegment = currentSegment.concat(segments[i].slice(1));
          used.add(i);
          foundConnection = true;
          break;
        } else if (arePointsClose(currentEnd, segmentEnd)) {
          // Connect to end: add reversed segment points (skip last duplicate point)
          const reversedSegment = [...segments[i]].reverse();
          currentSegment = currentSegment.concat(reversedSegment.slice(1));
          used.add(i);
          foundConnection = true;
          break;
        } else if (arePointsClose(currentStart, segmentEnd)) {
          // Connect to start: prepend segment points (skip last duplicate point)
          currentSegment = segments[i].slice(0, -1).concat(currentSegment);
          used.add(i);
          foundConnection = true;
          break;
        } else if (arePointsClose(currentStart, segmentStart)) {
          // Connect to start: prepend reversed segment points (skip first duplicate point)
          const reversedSegment = [...segments[i]].reverse();
          currentSegment = reversedSegment.slice(0, -1).concat(currentSegment);
          used.add(i);
          foundConnection = true;
          break;
        }
      }
    }

    // Add the main connected segment
    connectedSegments.push(currentSegment);

    // Add any remaining unconnected segments as separate lines
    for (let i = 0; i < segments.length; i++) {
      if (!used.has(i)) {
        connectedSegments.push(segments[i]);
      }
    }

    return connectedSegments;
  },

  // Create and add the river layer to the map
  createRiverLayer() {
    console.log('Creating river layer...');
    
    // Create GeoJSON layer with all processed river features
    this.sungaiLayer = L.geoJSON({ 
      type: 'FeatureCollection', 
      features: this.allFeatures 
    }, {
      // Default styling for all river lines
      style: {
        color: 'blue',
        weight: 2,
        opacity: 0.7
      },
      // Configure popup and hover behavior for each river
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.name || 'Sungai tanpa nama';
        
        // FIXED: Simple popup content without merge information
        const popupContent = `<strong>Nama Sungai:</strong> ${name}`;
        
        layer.bindPopup(popupContent);
        
        // Store default style for resetting
        layer.defaultStyle = { color: 'blue', weight: 2, opacity: 0.7 };
        
        // FIXED: Improved hover effects with better cursor handling
        layer.on({
          mouseover: (e) => this.handleMouseOver(e.target),
          mouseout: (e) => this.handleMouseOut(e.target),
          click: (e) => this.onRiverClick(feature, e.target)
        });
      }
    }).addTo(this.map);
    
    console.log('River layer created and added to map');
  },

  // FIXED: Handle mouse over event with longer delay to reduce sensitivity
  handleMouseOver(layer) {
    // Clear any existing timeout
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    
    // Only highlight if not already hovering over this layer
    if (this.currentHighlighted !== layer && !this.isHovering) {
      // Set delay before highlighting to reduce cursor sensitivity
      this.hoverTimeout = setTimeout(() => {
        this.highlightRiver(layer, false);
        this.currentHighlighted = layer;
        this.isHovering = true;
      }, 200); // 200ms delay before highlighting
    }
  },

  // FIXED: Handle mouse out event with longer delay to prevent flickering
  handleMouseOut(layer) {
    // Clear highlight timeout if mouse leaves before highlighting occurs
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    
    // Set a delay before resetting to prevent rapid flickering
    this.hoverTimeout = setTimeout(() => {
      if (this.currentHighlighted === layer) {
        this.resetRiverStyle(layer);
        this.currentHighlighted = null;
        this.isHovering = false;
      }
    }, 300); // 300ms delay before resetting
  },

  // Highlight specific river on map - Only highlights the clicked/searched river
  highlightRiver(targetLayer, zoomToRiver = true) {
    // Reset all rivers to default style first
    if (this.sungaiLayer) {
      this.sungaiLayer.eachLayer(layer => {
        if (layer !== targetLayer) {
          this.resetRiverStyle(layer);
        }
      });
    }
    
    // Highlight only the target river with orange color
    targetLayer.setStyle({
      color: 'orange',
      weight: 4,
      opacity: 1
    });
    targetLayer.bringToFront();
    
    // Zoom to river if requested (usually for search results)
    if (zoomToRiver) {
      this.map.fitBounds(targetLayer.getBounds(), { padding: [20, 20] });
    }
    
    // Show popup with river information
    targetLayer.openPopup();
  },

  // Reset river style to default - Returns river to normal blue color
  resetRiverStyle(layer) {
    if (layer && layer.defaultStyle) {
      layer.setStyle(layer.defaultStyle);
      layer.closePopup();
    }
  },

  // Handle river click event - Highlights and zooms to clicked river
  onRiverClick(feature, layer) {
    console.log(`Clicked on river: ${feature.properties?.name}`);
    this.highlightRiver(layer, true); // true = zoom to river
  },

  // Set up event listeners - Connects UI elements to their functions
  setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Search button click event
    this.elements.searchBtn.addEventListener('click', () => {
      this.performSearch();
    });

    // Search input enter key event
    this.elements.search.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.performSearch();
      }
    });

    // Export button click event
    this.elements.exportBtn.addEventListener('click', () => {
      this.exportGeoJSON();
    });

    // Search input for autocomplete suggestions
    this.elements.search.addEventListener('input', (e) => {
      this.updateAutocomplete(e.target.value);
    });
  },

  // Perform river search - Finds and highlights only matching rivers
  performSearch() {
    const searchTerm = this.elements.search.value.trim();
    console.log(`Searching for: "${searchTerm}"`);
    
    if (!searchTerm) {
      // Reset all styles if search is empty
      this.sungaiLayer.eachLayer(layer => this.resetRiverStyle(layer));
      return;
    }

    const normalizedSearch = this.normalizeName(searchTerm);
    let foundLayers = [];
    
    // Search through all river layers
    this.sungaiLayer.eachLayer(layer => {
      const feature = layer.feature;
      const name = feature.properties?.name || '';
      const normalizedName = this.normalizeName(name);
      
      // Also check merged names if they exist
      const mergedNames = feature.properties?.mergedNames || [];
      const normalizedMergedNames = mergedNames.map(n => this.normalizeName(n));

      // Better matching logic - exact match and partial match
      const exactMatch = normalizedName === normalizedSearch;
      const partialMatch = normalizedName.includes(normalizedSearch) || 
                          normalizedMergedNames.some(n => n.includes(normalizedSearch));

      if (exactMatch || partialMatch) {
        foundLayers.push(layer);
      }
    });

    if (foundLayers.length > 0) {
      console.log(`Found ${foundLayers.length} matching rivers`);
      
      // Reset all rivers first
      this.sungaiLayer.eachLayer(layer => this.resetRiverStyle(layer));
      
      // Highlight all matching rivers
      foundLayers.forEach(layer => {
        this.highlightRiver(layer, foundLayers.length === 1); // Only zoom if single result
      });
    } else {
      console.log('No rivers found');
      alert('Sungai tidak ditemukan');
    }
  },

  // Update autocomplete suggestions - Shows dropdown with matching river names
  updateAutocomplete(value) {
    if (!value || value.length < 2) {
      // Remove autocomplete when search is too short
      this.elements.search.removeAttribute('list');
      return;
    }

    const normalizedValue = this.normalizeName(value);
    
    // Remove existing datalist to prevent duplicates
    let datalist = document.getElementById('river-suggestions');
    if (datalist) datalist.remove();

    // Create new datalist for autocomplete
    datalist = document.createElement('datalist');
    datalist.id = 'river-suggestions';

    // Find matching river names (including merged names)
    const suggestions = new Set();
    
    this.allFeatures.forEach(feature => {
      const mainName = feature.properties?.name || '';
      const mergedNames = feature.properties?.mergedNames || [mainName];
      
      // Check all names (main and merged) for matches
      mergedNames.forEach(name => {
        if (name && this.normalizeName(name).includes(normalizedValue)) {
          suggestions.add(name);
        }
      });
    });

    // Add suggestions to datalist (limit to 10 suggestions)
    [...suggestions].sort().slice(0, 10).forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      datalist.appendChild(option);
    });

    // Connect datalist to search input
    document.body.appendChild(datalist);
    this.elements.search.setAttribute('list', 'river-suggestions');
  },

  // Export GeoJSON data - Downloads filtered or all river data
  exportGeoJSON() {
    const searchTerm = this.elements.search.value.trim();
    let features = this.allFeatures;

    console.log(`Exporting GeoJSON${searchTerm ? ` for search: "${searchTerm}"` : ' (all rivers)'}`);

    // Filter features if there's a search term
    if (searchTerm) {
      const normalizedSearch = this.normalizeName(searchTerm);
      features = features.filter(feature => {
        const name = feature.properties?.name || '';
        const mergedNames = feature.properties?.mergedNames || [name];
        
        return this.normalizeName(name).includes(normalizedSearch) ||
               mergedNames.some(n => this.normalizeName(n).includes(normalizedSearch));
      });
      
      console.log(`Filtered to ${features.length} features`);
    }

    // Create GeoJSON object
    const geoJSON = {
      type: 'FeatureCollection',
      features: features,
      metadata: {
        exportDate: new Date().toISOString(),
        searchTerm: searchTerm || null,
        totalFeatures: features.length
      }
    };

    // Create and trigger download
    const blob = new Blob([JSON.stringify(geoJSON, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = searchTerm ? `rivers_${searchTerm.replace(/\s+/g, '_')}.geojson` : 'rivers_all.geojson';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('GeoJSON export completed');
  },

  // FIXED: Much better normalize river name for comparison - handles "Ci Liwung" vs "ciliwung"
  normalizeName(name) {
    if (!name) return '';
    
    let normalized = name
      .toLowerCase() // Convert to lowercase first
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Remove diacritics
    
    // IMPROVED: Remove all non-alphanumeric characters aggressively BEFORE prefix removal
    // This turns "Ci Liwung" into "ciliwung" and "ciliwung" into "ciliwung"
    normalized = normalized
      .replace(/[^a-z0-9]/g, ''); // Remove all non-alphanumeric characters (including spaces)
    
    // Now, define prefixes to remove from the already cleaned string
    // The prefixes themselves should be stripped of spaces/special chars as well for matching
    const prefixesToRemove = [
      'sungai',
      'kali',
      'ci', // Now "ci" will match "ciliwung" if it starts with "ci"
      'k',
      's',
      'bendung',
      'saluran'
    ];
    
    // Iterate and remove prefixes if they are at the beginning of the normalized string
    prefixesToRemove.forEach(prefix => {
      // Use a regex to match the prefix at the start of the string
      // The 'i' flag is not needed here as we already lowercased the string
      const regex = new RegExp('^' + prefix); 
      normalized = normalized.replace(regex, '');
    });
    
    // Final trim just in case (though highly unlikely with this approach)
    normalized = normalized.trim();
    
    console.log(`Name normalization: "${name}" -> "${normalized}"`);
    return normalized;
  },

  // Show/hide loading spinner - Controls loading animation visibility
  showLoading(show) {
    this.elements.loadingSpinner.style.display = show ? 'block' : 'none';
    console.log(`Loading spinner: ${show ? 'shown' : 'hidden'}`);
  }
};

// Initialize application when DOM is loaded - Entry point
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing River App...');
  RiverApp.init();
});