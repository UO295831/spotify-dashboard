// src/js/fingerprint.js

/**
 * FingerprintView - Radar Chart showing average audio profile
 * 
 * Displays 6 audio features:
 * - Danceability
 * - Energy
 * - Valence (Happiness)
 * - Acousticness
 * - Speechiness
 * - Liveness
 * 
 * Updates when songs are selected in Universe view
 * Clicking on a feature axis triggers recoloring in Universe
 */

class FingerprintView {
    constructor(containerId, data) {
        this.containerId = containerId;
        this.data = data;
        
        // Audio features to display
        this.features = [
            { key: 'danceability_%', label: 'Danceability' },
            { key: 'energy_%', label: 'Energy' },
            { key: 'valence_%', label: 'Valence' },
            { key: 'acousticness_%', label: 'Acousticness' },
            { key: 'speechiness_%', label: 'Speechiness' },
            { key: 'liveness_%', label: 'Liveness' }
        ];
        
        this.init();
    }
    
    init() {
        const container = d3.select(this.containerId);
        
        // 1. LIMPIEZA (Para evitar duplicados al recargar)
        container.selectAll('*').remove();

        // 2. TAMAÑO VIRTUAL FIJO (Cuadrado ideal para gráficos radiales)
        const totalWidth = 350;
        const totalHeight = 350;

        // 3. MÁRGENES (Suficientes para que las etiquetas de texto no se corten)
        this.margin = {top: -60, right: 40, bottom: 200, left: 40};

        this.width = totalWidth - this.margin.left - this.margin.right;
        this.height = totalHeight - this.margin.top - this.margin.bottom;

        // 4. RADIO DEL GRÁFICO (La clave del tamaño)
        // Calculamos el radio máximo posible para que quepa en nuestro lienzo virtual
       this.radius = Math.min(this.width, this.height) / 1.3;

        // 5. SVG RESPONSIVO
        this.svg = container.append('svg')
            .attr('width', '100%')      // Se adapta al ancho de tu pantalla
            .attr('height', '90%')     // Se adapta al alto de tu pantalla
            .attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`) // Lienzo fijo 400x400
            .attr('preserveAspectRatio', 'xMidYMid meet') // Mantiene la proporción
            .style('overflow', 'visible');

        // 6. GRUPO CENTRADO (Diferencia importante con Battleground)
        // Movemos el punto (0,0) al CENTRO EXACTO del lienzo para dibujar en círculo
        this.g = this.svg.append('g')
            .attr('transform', `translate(${totalWidth / 2}, ${totalHeight / 2})`);
        
        console.log('✓ Fingerprint view initialized (Responsive Centered)');
        
        // Render inicial si hay datos
        if (this.data) {
             this.update(this.data);
        }
    }
    
    update(selectedData) {
        // Clear previous visualization
        this.g.selectAll('*').remove();
        
        // Render with new data
        this.render(selectedData);
    }
    
    render(data) {
        const self = this;
        
        // Calculate average values for each feature
        const averages = this.features.map(feature => {
            const sum = data.reduce((acc, d) => acc + (d[feature.key] || 0), 0);
            return {
                key: feature.key,
                label: feature.label,
                value: sum / data.length
            };
        });
        
        // Create radial scale (0-100% maps to radius)
        const rScale = d3.scaleLinear()
            .domain([0, 100])
            .range([0, this.radius]);
        
        // Angle for each feature axis
        const angleSlice = (Math.PI * 2) / this.features.length;
        
        // Draw circular grid levels (20%, 40%, 60%, 80%, 100%)
        this.drawGrid(rScale, angleSlice);
        
        // Draw feature axes
        this.drawAxes(rScale, angleSlice);
        
        // Draw the radar area
        this.drawRadarArea(averages, rScale, angleSlice);
        
        // Draw data points
        this.drawDataPoints(averages, rScale, angleSlice);
    }
    
    drawGrid(rScale, angleSlice) {
        const levels = 5;
        const levelStep = 100 / levels; // 20%
        
        // Draw concentric circles
        for (let level = 1; level <= levels; level++) {
            const radius = rScale(level * levelStep);
            
            // Circle
            this.g.append('circle')
                .attr('r', radius)
                .attr('fill', 'none')
                .attr('stroke', '#e0e0e0')
                .attr('stroke-width', 1.5)
                .attr('opacity', 0.5);
            
            // Label
            if (level < levels) {  // Don't label 100%
                this.g.append('text')
                    .attr('x', 5)
                    .attr('y', -radius)
                    .attr('font-size', '10px')
                    .attr('fill', '#999')
                    .attr('alignment-baseline', 'middle')
                    .text(`${level * levelStep}%`);
            }
        }
    }
    
    drawAxes(rScale, angleSlice) {
        const self = this;
        
        this.features.forEach((feature, i) => {
            const angle = angleSlice * i - Math.PI / 2;
            const x = Math.cos(angle) * this.radius;
            const y = Math.sin(angle) * this.radius;
            
            // Axis line
            this.g.append('line')
                .attr('x1', 0)
                .attr('y1', 0)
                .attr('x2', x)
                .attr('y2', y)
                .attr('stroke', '#ccc')
                .attr('stroke-width', 2);
            
            // Label background (for better readability)
            const labelDistance = this.radius + 25;
            const labelX = Math.cos(angle) * labelDistance;
            const labelY = Math.sin(angle) * labelDistance;
            
            // Clickable label area
            const labelGroup = this.g.append('g')
                .attr('class', 'axis-label-group')
                .attr('transform', `translate(${labelX}, ${labelY})`)
                .style('cursor', 'pointer')
                .on('click', function() {
                    const featureKey = feature.key;
                    
                    // 1. Actualizar AppState
                    AppState.colorMode = featureKey;
                    
                    // 2. Cambiar dropdown
                    const colorSelect = document.getElementById('color-mode');
                    if (colorSelect) {
                        colorSelect.value = featureKey;
                    }
                    
                    // 3. Actualizar Universe directamente
                    if (AppState.views && AppState.views.universe) {
                        AppState.views.universe.updateColorMode(featureKey);
                    }
                    
                    // 4. CLAVE: Disparar evento change para mostrar el slider
                    if (colorSelect) {
                        colorSelect.dispatchEvent(new Event('change'));
                    }
                })
                .on('mouseover', function() {
                    d3.select(this).select('text')
                        .transition()
                        .duration(200)
                        .attr('font-size', '14px')
                        .attr('fill', '#667eea');
                })
                .on('mouseout', function() {
                    d3.select(this).select('text')
                        .transition()
                        .duration(200)
                        .attr('font-size', '12px')
                        .attr('fill', '#333');
                });
            
            // Background rectangle for label
            const labelText = labelGroup.append('text')
                .attr('text-anchor', 'middle')
                .attr('alignment-baseline', 'middle')
                .attr('font-size', '12px')
                .attr('font-weight', 'bold')
                .attr('fill', '#333')
                .text(feature.label);
            
            // Add background for better readability
            const textBBox = labelText.node().getBBox();
            labelGroup.insert('rect', 'text')
                .attr('x', textBBox.x - 4)
                .attr('y', textBBox.y - 2)
                .attr('width', textBBox.width + 8)
                .attr('height', textBBox.height + 4)
                .attr('fill', 'white')
                .attr('opacity', 0.8)
                .attr('rx', 3);
        });
    }
    
    drawRadarArea(averages, rScale, angleSlice) {
        // Create radial line generator
        const radarLine = d3.lineRadial()
            .angle((d, i) => angleSlice * i)
            .radius(d => rScale(d.value))
            .curve(d3.curveLinearClosed);
        
        // Draw the filled area
        this.g.append('path')
            .datum(averages)
            .attr('d', radarLine)
            .attr('fill', '#FF8C00')
            .attr('fill-opacity', 0.25)
            .attr('stroke', '#FF8C00')
            .attr('stroke-width', 3)
            .attr('stroke-linejoin', 'round');
        
        // Add subtle glow effect
        this.g.append('path')
            .datum(averages)
            .attr('d', radarLine)
            .attr('fill', 'none')
            .attr('stroke', '#FF8C00')
            .attr('stroke-width', 1)
            .attr('stroke-opacity', 0.5)
            .attr('filter', 'url(#glow)');
        
        // Define glow filter
        const defs = this.svg.append('defs');
        const filter = defs.append('filter')
            .attr('id', 'glow');
        
        filter.append('feGaussianBlur')
            .attr('stdDeviation', '3')
            .attr('result', 'coloredBlur');
        
        const feMerge = filter.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');
    }
    
    drawDataPoints(averages, rScale, angleSlice) {
        const self = this;
        
        // Draw circles at each data point
        averages.forEach((d, i) => {
            const angle = angleSlice * i - Math.PI / 2;
            const x = Math.cos(angle) * rScale(d.value);
            const y = Math.sin(angle) * rScale(d.value);
            
            this.g.append('circle')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', 6)
                .attr('fill', '#FF8C00')
                .attr('stroke', 'white')
                .attr('stroke-width', 2.5)
                .style('cursor', 'pointer')
                .on('mouseover', function(event) {
                    // Enlarge on hover
                    d3.select(this)
                        .transition()
                        .duration(200)
                        .attr('r', 8);
                    
                    // Show tooltip
                    self.showTooltip(event, d);
                })
                .on('mouseout', function() {
                    // Return to normal size
                    d3.select(this)
                        .transition()
                        .duration(200)
                        .attr('r', 6);
                    
                    // Hide tooltip
                    self.hideTooltip();
                });
        });
    }
    
    showTooltip(event, d) {
        // Create tooltip if it doesn't exist
        if (!this.tooltip) {
            this.tooltip = d3.select('body')
                .append('div')
                .attr('class', 'tooltip')
                .style('opacity', 0);
        }
        
        this.tooltip
            .transition()
            .duration(200)
            .style('opacity', 1);
        
        this.tooltip
            .html(`
                <strong>${d.label}</strong><br>
                Average: <strong>${d.value.toFixed(1)}%</strong>
            `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
    }
    
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip
                .transition()
                .duration(200)
                .style('opacity', 0);
        }
    }
}
