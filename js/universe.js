// src/js/universe.js - VERSION MEJORADA CON BRUSH Y ZOOM

/**
 * UniverseView - Enhanced t-SNE Scatter Plot
 * 
 * Features:
 * - Brush selection (rectangular and lasso-like)
 * - Zoom and pan (mouse wheel + drag)
 * - Reset zoom button
 * - Smooth transitions
 * - Ghost effect on selection
 */

class UniverseView {
    constructor(containerId, data) {
        this.containerId = containerId;
        this.data = data;
        this.colorMode = 'mode';
        this.margin = {top: 50, right: 50, bottom: 55, left: 55};

        this.lassoMode = false;
        
        // Zoom state
        this.currentTransform = d3.zoomIdentity;
        
        this.init();
    }
    
    init() {
        const container = d3.select(this.containerId);
        const bbox = container.node().getBoundingClientRect();
        
        this.width = bbox.width - this.margin.left - this.margin.right;
        this.height = bbox.height - this.margin.top - this.margin.bottom;
        // 1. SVG
        this.svg = container.append('svg')
            .attr('width', bbox.width)
            .attr('height', bbox.height);
            
        // 2. DEFINIR MÁSCARA (CLIP PATH)
        this.svg.append("defs").append("clipPath")
            .attr("id", "universe-clip")
            .append("rect")
            .attr("width", this.width)
            .attr("height", this.height);
        
        // 3. GRUPO PRINCIPAL (Márgenes)
        this.g = this.svg.append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

        this.legendContainer = this.g.append('g')
            .attr('class', 'legend-container')
            .attr('transform', `translate(${this.width - 80}, -47)`);
                
        // Window
        const clippedFrame = this.g.append("g")
             .attr("clip-path", "url(#universe-clip)");

        // zoomGroup moves behind the window
        this.zoomGroup = clippedFrame.append('g')
            .attr('class', 'zoom-group');
                    
        this.createScales();
        this.drawAxes();
        this.drawPoints();
        this.setupZoom();
        this.setupBrush();
        this.drawMarginalDistributions();
        this.createTooltip();
        this.addControlButtons();
        this.updateLegend()
        
        console.log('Universe view initialized (Clipped)');
    }

    createScales() {
        const xExtent = d3.extent(this.data, d => d.tsne_1);
        const yExtent = d3.extent(this.data, d => d.tsne_2);

        const xPadding = (xExtent[1] - xExtent[0]) * 0.10;
        const yPadding = (yExtent[1] - yExtent[0]) * 0.10;
        
        // X scale
        this.xScale = d3.scaleLinear()
            // Restamos padding al mínimo y sumamos al máximo
            .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
            .range([0, this.width]); 
        
        // Y scale
        this.yScale = d3.scaleLinear()
            .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
            .range([this.height, 0]);
                
        // Size scale (by streams)
        this.sizeScale = d3.scaleSqrt()
            .domain(d3.extent(this.data, d => d.streams))
            .range([3, 20]);
        
        // Color scales (Tus paletas originales)
        this.colorScales = {
            'mode': d3.scaleOrdinal()
                .domain(['Major', 'Minor'])
                .range(['#FF8C00', '#4169E1']),  // Orange, Blue
            
            'energy_%': d3.scaleSequential(d3.interpolateViridis)
                .domain([0, 100]),
            
            'danceability_%': d3.scaleSequential(d3.interpolatePlasma)
                .domain([0, 100]),
            
            'valence_%': d3.scaleSequential(d3.interpolateRdYlGn)
                .domain([0, 100]),
            
            'acousticness_%': d3.scaleSequential(d3.interpolateYlGnBu)
                .domain([0, 100]),

            'liveness_%': d3.scaleSequential(d3.interpolateTurbo)
                .domain([0, 100]),

            'speechiness_%': d3.scaleSequential(d3.interpolateCool)
                .domain([0, 100])               
        };
    }
    
    drawAxes() {
        // X axis
        this.xAxisGroup = this.g.append('g')
            .attr('class', 'axis x-axis')
            .attr('transform', `translate(0,${this.height})`)
            .call(d3.axisBottom(this.xScale).ticks(8));
        
        this.xAxisGroup.append('text')
            .attr('class', 'axis-label')
            .attr('x', this.width / 2)
            .attr('y', 40)
            .attr('fill', 'black')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .text('t-SNE Dimension 1');
        
        // Y axis
        this.yAxisGroup = this.g.append('g')
            .attr('class', 'axis y-axis')
            .call(d3.axisLeft(this.yScale).ticks(8));
        
        this.yAxisGroup.append('text')
            .attr('class', 'axis-label')
            .attr('transform', 'rotate(-90)')
            .attr('x', -this.height / 2)
            .attr('y', -40)
            .attr('fill', 'black')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .text('t-SNE Dimension 2');
        
        // Grid
        this.g.append('g')
            .attr('class', 'grid')
            .attr('opacity', 0.1)
            .call(d3.axisLeft(this.yScale)
                .tickSize(-this.width)
                .tickFormat('')
            );
        
        this.g.append('g')
            .attr('class', 'grid')
            .attr('transform', `translate(0,${this.height})`)
            .attr('opacity', 0.1)
            .call(d3.axisBottom(this.xScale)
                .tickSize(-this.height)
                .tickFormat('')
            );
    }
    // Método 1: Aplicar filtro de rango
    applyRangeFilter(feature, minVal, maxVal) {
        // Determinar qué canciones considerar
        const baseData = this.currentSelection || this.data;
        
        this.circles
            .transition()
            .duration(300)
            .attr('opacity', d => {
                const value = d[feature];
                
                // Si hay selección de lasso
                if (this.currentSelection) {
                    const isInSelection = this.currentSelection.includes(d);
                    
                    if (!isInSelection) {
                        // No está en selección de lasso -> muy atenuado
                        return 0.05;
                    }
                    
                    // Está en selección -> aplicar filtro de rango
                    return (value >= minVal && value <= maxVal) ? 0.9 : 0.15;
                } else {
                    // Sin selección de lasso -> filtro normal
                    return (value >= minVal && value <= maxVal) ? 0.9 : 0.15;
                }
            })
            .attr('stroke-width', d => {
                if (this.currentSelection && !this.currentSelection.includes(d)) {
                    return 1;
                }
                const value = d[feature];
                return (value >= minVal && value <= maxVal) ? 2 : 1;
            });
        
        // Filtrar solo dentro de la selección actual
        const filtered = baseData.filter(d => {
            const value = d[feature];
            return value >= minVal && value <= maxVal;
        });
        
        if (typeof handleSelection === 'function') {
            handleSelection(filtered);
        }
        
        console.log(`✓ Range filter: ${filtered.length} of ${baseData.length} songs`);
    }
    // Método 2: Limpiar filtro
    clearRangeFilter() {
        this.circles
            .transition()
            .duration(300)
            .attr('opacity', 0.7)
            .attr('stroke-width', 1);
        
        if (typeof handleSelection === 'function') {
            handleSelection(this.data);
        }
    }
    drawPoints() {
        const self = this;
        
        this.circles = this.zoomGroup.selectAll('circle.song-point')
            .data(this.data)
            .enter()
            .append('circle')
            .attr('class', 'song-point')
            .attr('cx', d => this.xScale(d.tsne_1))
            .attr('cy', d => this.yScale(d.tsne_2))
            .attr('r', d => this.sizeScale(d.streams))
            .attr('fill', d => this.getColor(d))
            .attr('opacity', 0.7)
            .attr('stroke', 'white')
            .attr('stroke-width', 1)
            .style('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                // SOLO cambiar opacidad y stroke, NO color
                d3.select(this)
                    .transition()
                    .duration(200)
                    // .attr('opacity', 1)  // Solo aumentar opacidad
                    .attr('stroke-width', 3)
                    .attr('stroke', '#FFD700');  // Borde dorado al hover
                
                self.showTooltip(event, d);
            })
            .on('mouseout', function(event, d) {
                // Volver a la opacidad que tenía (respetar filtros)
                const currentOpacity = parseFloat(d3.select(this).attr('opacity'));
                const targetOpacity = currentOpacity > 0.8 ? 0.9 : 
                                    currentOpacity > 0.5 ? 0.7 : 
                                    currentOpacity;
                
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr('opacity', targetOpacity)  // Mantener opacidad actual
                    .attr('stroke-width', currentOpacity > 0.8 ? 2 : 1)
                    .attr('stroke', 'white');  // Volver a borde blanco
                
                self.hideTooltip();
            });
    }

    applyFilters(filteredData) {
        const filteredSet = new Set(filteredData.map(d => d.track_name));
        
        this.circles
            .transition()
            .duration(300)
            .attr('opacity', d => filteredSet.has(d.track_name) ? 0.9 : 0.1)
            .attr('stroke-width', d => filteredSet.has(d.track_name) ? 2 : 1);
    }
    applyModeFilter(mode) {
        // Determinar qué canciones considerar (respeta selección de lasso)
        const baseData = this.currentSelection || this.data;
        
        this.circles
            .transition()
            .duration(300)
            .attr('opacity', d => {
                // Si hay selección de lasso
                if (this.currentSelection) {
                    const isInSelection = this.currentSelection.includes(d);
                    
                    if (!isInSelection) {
                        return 0.05;  // Fuera de lasso
                    }
                    
                    // Dentro de lasso -> aplicar filtro de modo
                    if (mode === 'both') return 0.9;
                    return (d.mode === mode) ? 0.9 : 0.15;
                } else {
                    // Sin lasso -> filtro normal
                    if (mode === 'both') return 0.7;
                    return (d.mode === mode) ? 0.9 : 0.15;
                }
            })
            .attr('stroke-width', d => {
                if (this.currentSelection && !this.currentSelection.includes(d)) {
                    return 1;
                }
                if (mode === 'both') return 1;
                return (d.mode === mode) ? 2 : 1;
            });
        
        // Filtrar datos
        const filtered = baseData.filter(d => {
            if (mode === 'both') return true;
            return d.mode === mode;
        });
        
        if (typeof handleSelection === 'function') {
            handleSelection(filtered);
        }
        
        console.log(`✓ Mode filter: ${filtered.length} ${mode} songs`);
    }
    drawMarginalDistributions() {
        this.g.selectAll(".marginal-hist").remove();

        const featureColors = {
            'energy_%': '#CB181D',         // Rojo
            'danceability_%': '#6A51A3',   // Morado
            'valence_%': '#238B45',        // Verde
            'acousticness_%': '#2171B5',   // Azul
            'liveness_%': '#E6550D',       // Naranja
            'speechiness_%': '#6A5ACD',    // Púrpura suave
            'mode': '#764ba2'              // Color por defecto (puedes poner el de "Major")
        };

        const baseColor = featureColors[this.colorMode] || '#764ba2';
        
        const endColor = d3.color(baseColor).brighter(1.5).formatHex(); 

        let defs = this.svg.select("defs");
        if (defs.empty()) defs = this.svg.append("defs");

        defs.selectAll(".dynamic-bar-grad").remove();

        const gradIdX = "grad-x-" + this.colorMode; // ID único basado en el modo
        const gradientX = defs.append("linearGradient")
            .attr("id", gradIdX)
            .attr("class", "dynamic-bar-grad")
            .attr("x1", "0%").attr("y1", "100%") // Empieza abajo (pegado al gráfico)
            .attr("x2", "0%").attr("y2", "0%");   // Termina arriba

        gradientX.append("stop").attr("offset", "0%").attr("stop-color", baseColor).attr("stop-opacity", 0.9);
        gradientX.append("stop").attr("offset", "100%").attr("stop-color", endColor).attr("stop-opacity", 0.4);

        const gradIdY = "grad-y-" + this.colorMode;
        const gradientY = defs.append("linearGradient")
            .attr("id", gradIdY)
            .attr("class", "dynamic-bar-grad")
            .attr("x1", "0%").attr("y1", "0%")   // Empieza izquierda
            .attr("x2", "100%").attr("y2", "0%"); // Termina derecha

        gradientY.append("stop").attr("offset", "0%").attr("stop-color", baseColor).attr("stop-opacity", 0.9);
        gradientY.append("stop").attr("offset", "100%").attr("stop-color", endColor).attr("stop-opacity", 0.4);

        const BIN_COUNT = 40; 

        const histogramX = d3.bin()
            .value(d => d.tsne_1)
            .domain(this.xScale.domain())
            .thresholds(this.xScale.ticks(BIN_COUNT));

        const binsX = histogramX(this.data);

        const yDistScale = d3.scaleLinear()
            .domain([0, d3.max(binsX, d => d.length)])
            .range([0, this.margin.top - 10]);

        const topBars = this.g.append("g")
            .attr("class", "marginal-hist marginal-x")
            .attr("transform", `translate(0, ${-this.margin.top})`);

        topBars.selectAll("rect")
            .data(binsX)
            .enter()
            .append("rect")
            .attr("x", d => this.xScale(d.x0) + 1)
            .attr("width", d => Math.max(0, this.xScale(d.x1) - this.xScale(d.x0) - 1))
            .attr("y", d => (this.margin.top - yDistScale(d.length)))
            .attr("height", d => yDistScale(d.length))
            .attr("fill", `url(#${gradIdX})`); // <--- APLICAMOS DEGRADADO X

        const histogramY = d3.bin()
            .value(d => d.tsne_2)
            .domain(this.yScale.domain())
            .thresholds(this.yScale.ticks(BIN_COUNT));

        const binsY = histogramY(this.data);

        const xDistScale = d3.scaleLinear()
            .domain([0, d3.max(binsY, d => d.length)])
            .range([0, this.margin.right - 10]);

        const rightBars = this.g.append("g")
            .attr("class", "marginal-hist marginal-y")
            .attr("transform", `translate(${this.width}, 0)`);

        rightBars.selectAll("rect")
            .data(binsY)
            .enter()
            .append("rect")
            .attr("y", d => this.yScale(d.x1) + 1)
            .attr("height", d => Math.max(0, this.yScale(d.x0) - this.yScale(d.x1) - 1))
            .attr("x", 0)
            .attr("width", d => xDistScale(d.length))
            .attr("fill", `url(#${gradIdY})`); 
    }

    drawTopHistogram(height, numBins) {
        // CAMBIO: Usar ticks para bins uniformes
        const xBins = d3.bin()
            .domain(this.xScale.domain())
            .thresholds(this.xScale.ticks(numBins))  // ← CAMBIO AQUÍ
            .value(d => d.tsne_1);
        
        const binnedData = xBins(this.data);
        
        const histYScale = d3.scaleLinear()
            .domain([0, d3.max(binnedData, d => d.length)])
            .range([0, height]);
        
        const topHistGroup = this.g.append('g')  // CAMBIO: append en lugar de insert
            .attr('class', 'top-histogram')
            .attr('transform', `translate(0, ${-height - 5})`);
        
        topHistGroup.selectAll('rect')
            .data(binnedData)
            .enter()
            .append('rect')
            .attr('x', d => this.xScale(d.x0))
            .attr('y', d => height - histYScale(d.length))
            .attr('width', d => Math.max(0, this.xScale(d.x1) - this.xScale(d.x0) - 1))
            .attr('height', d => histYScale(d.length))
            .attr('fill', '#667eea')
            .attr('opacity', 0.6)
            .attr('stroke', 'white')
            .attr('stroke-width', 0.5);
        
        topHistGroup.append('line')
            .attr('x1', 0)
            .attr('x2', this.width)
            .attr('y1', height)
            .attr('y2', height)
            .attr('stroke', '#999')
            .attr('stroke-width', 1);
    }

    drawRightHistogram(width, numBins) {
        // CAMBIO: Usar ticks para bins uniformes
        const yBins = d3.bin()
            .domain(this.yScale.domain())
            .thresholds(this.yScale.ticks(numBins))  // ← CAMBIO AQUÍ
            .value(d => d.tsne_2);
        
        const binnedData = yBins(this.data);
        
        const histXScale = d3.scaleLinear()
            .domain([0, d3.max(binnedData, d => d.length)])
            .range([0, width]);
        
        const rightHistGroup = this.g.append('g')  // CAMBIO: append en lugar de insert
            .attr('class', 'right-histogram')
            .attr('transform', `translate(${this.width + 5}, 0)`);
        
        rightHistGroup.selectAll('rect')
            .data(binnedData)
            .enter()
            .append('rect')
            .attr('x', 0)
            .attr('y', d => this.yScale(d.x1))
            .attr('width', d => histXScale(d.length))
            .attr('height', d => Math.max(0, this.yScale(d.x0) - this.yScale(d.x1) - 1))
            .attr('fill', '#764ba2')
            .attr('opacity', 0.6)
            .attr('stroke', 'white')
            .attr('stroke-width', 0.5);
        
        rightHistGroup.append('line')
            .attr('x1', 0)
            .attr('x2', 0)
            .attr('y1', 0)
            .attr('y2', this.height)
            .attr('stroke', '#999')
            .attr('stroke-width', 1);
    }
    
    getColor(d) {
        if (this.colorMode === 'mode') {
            return this.colorScales.mode(d.mode);
        } else {
            return this.colorScales[this.colorMode](d[this.colorMode]);
        }
    }
    
    setupZoom() {
        const self = this;
        
        this.zoom = d3.zoom()
            .scaleExtent([0.5, 10])
            .translateExtent([[-100, -100], [this.width + 100, this.height + 100]])
            .filter(function(event) {
                // Zoom con scroll: SIEMPRE
                if (event.type === 'wheel') {
                    return true;
                }
                
                // Pan con drag: SOLO si NO está en modo lasso
                if (event.type === 'mousedown' || event.type === 'mousemove') {
                    return !self.lassoMode;  // ← Clave: verificar modo
                }

                // Touch events (móviles): SOLO si NO está en modo lasso
                if (event.type.startsWith('touch')) {
                    return !self.lassoMode;
                }

                return false;
            })
            .on('zoom', function(event) {
                self.zoomed(event);
            });
        
        this.svg.call(this.zoom);
        this.svg.on('dblclick.zoom', null);
        this.svg.on('dblclick', () => this.resetZoom());
        
        console.log('✓ Zoom: Scroll=zoom, Shift+Drag=pan');
    }
    
    zoomed(event) {
        // Save current transform
        this.currentTransform = event.transform;
        
        // ANTES: Aplicar transform a zoom group Y actualizar ejes
        // DESPUÉS: Solo aplicar transform a zoom group
        
        // Solo transformar los puntos, NO los ejes
        this.zoomGroup.attr('transform', event.transform);
        
        // COMENTAR o ELIMINAR estas líneas (ejes NO se mueven):
        /*
        this.xAxisGroup.call(
            d3.axisBottom(event.transform.rescaleX(this.xScale)).ticks(8)
        );
        
        this.yAxisGroup.call(
            d3.axisLeft(event.transform.rescaleY(this.yScale)).ticks(8)
        );
        */
        
        console.log(`Zoom: ${event.transform.k.toFixed(2)}x`);
    }
    
    resetZoom() {
        this.svg.transition()
            .duration(750)
            .call(this.zoom.transform, d3.zoomIdentity);
        
        console.log('✓ Zoom reset');
    }
    
    setupBrush() {
        const self = this;
        
        // Create brush behavior
        this.brush = d3.brush()
            .extent([[0, 0], [this.width, this.height]])  // ← already correct
            .filter(function(event) {
                return self.lassoMode;
            })
            .on('start', function(event) {
                if (!self.lassoMode) return;
            })
            .on('brush', function(event) {
                if (!self.lassoMode || !event.selection) return;
                self.highlightBrushedPoints(event.selection, true);
            })
            .on('end', function(event) {
                if (!self.lassoMode) return;
                self.onBrushEnd(event);
            });
        
        // Add brush to a separate layer (above zoom group)
        this.brushGroup = this.g.append('g')
            .attr('class', 'brush')
            .call(this.brush);
        
        // Style brush
        this.brushGroup.select('.overlay')
            .style('cursor', 'crosshair');
        
        this.brushGroup.select('.selection')
            .style('fill', '#667eea')
            .style('fill-opacity', 0.2)
            .style('stroke', '#667eea')
            .style('stroke-width', 2);
        
        this.brushGroup.style('display', 'none');
    }

        // NUEVO: Función para activar/desactivar modo lasso
    toggleLassoMode() {
        this.lassoMode = !this.lassoMode;
        
        if (this.lassoMode) {
            // Activar modo lasso
            this.brushGroup.style('display', null);
            this.brushGroup.select('.overlay').style('cursor', 'crosshair');
            this.svg.style('cursor', 'crosshair');
            console.log('✓ Lasso mode: ON');
        } else {
            // Desactivar modo lasso
            this.brushGroup.style('display', 'none');
            this.brushGroup.call(this.brush.move, null); // Limpiar selección
            this.svg.style('cursor', 'default');
            console.log('✓ Lasso mode: OFF (pan/zoom enabled)');
        }
        
        // Actualizar apariencia del botón
        this.updateLassoButton();
    }
    
    // NUEVO: Actualizar apariencia del botón lasso
    updateLassoButton() {
        const button = this.svg.select('.lasso-button rect');
        const text = this.svg.select('.lasso-button text');
        
        if (this.lassoMode) {
            // Modo activo: botón verde
            button.attr('fill', '#10b981');
            text.text('Lasso: ON');
        } else {
            // Modo inactivo: botón gris
            button.attr('fill', '#6b7280');
            text.text('Lasso: OFF');
        }
    }
    
    updateBrushExtent(transform) {
        // Update brush extent to match zoom
        // This keeps brush selection accurate during zoom
        this.brush.extent([
            [0, 0],
            [this.width, this.height]
        ]);
        
        this.brushGroup.call(this.brush);
    }
    
    highlightBrushedPoints(selection, temporary = false) {
        if (!selection) {
            this.circles.attr('opacity', 0.7);
            return;
        }

        const [[x0, y0], [x1, y1]] = selection;
        const transform = this.currentTransform;

        this.circles.attr('opacity', d => {
            const px = transform.applyX(this.xScale(d.tsne_1));
            const py = transform.applyY(this.yScale(d.tsne_2));
            const inside = px >= x0 && px <= x1 && py >= y0 && py <= y1;
            return inside ? 0.9 : (temporary ? 0.2 : 0.05);
        });
    }
        
    onBrushEnd(event) {
        if (!event.selection) {
            this.circles.transition().duration(300).attr('opacity', 0.7);
            FilterState.lassoSelection = null;
            applyAllFilters();
            return;
        }

        const [[x0, y0], [x1, y1]] = event.selection;
        const transform = this.currentTransform;
        const selected = [];

        this.circles.each((d) => {
            // Get pixel position in zoomGroup space, then apply zoom transform
            const px = transform.applyX(this.xScale(d.tsne_1));
            const py = transform.applyY(this.yScale(d.tsne_2));

            // Strict containment — point center must be inside brush rectangle
            if (px >= x0 && px <= x1 && py >= y0 && py <= y1) {
                selected.push(d);
            }
        });

        this.highlightBrushedPoints(event.selection, false);

        FilterState.lassoSelection = selected;
        applyAllFilters();

        console.log(`✓ Lasso selected ${selected.length} songs`);
    }

    // NUEVO: Añadir botones de control
    addControlButtons() {
        const self = this;
        const buttonY = 10;
        
        // Botón 1: Toggle Lasso Mode
        const lassoButton = this.svg.append('g')
            .attr('class', 'lasso-button')
            .attr('transform', `translate(${this.margin.left + 10}, ${this.margin.top + buttonY})`)
            .style('cursor', 'pointer')
            .on('click', () => this.toggleLassoMode())
            .on('mouseover', function() {
                d3.select(this).select('rect')
                    .transition()
                    .duration(200)
                    .attr('opacity', 1);
            })
            .on('mouseout', function() {
                d3.select(this).select('rect')
                    .transition()
                    .duration(200)
                    .attr('opacity', 0.9);
            });
        
        lassoButton.append('rect')
            .attr('width', 90)
            .attr('height', 30)
            .attr('rx', 5)
            .attr('fill', '#6b7280')  // Gris por defecto
            .attr('opacity', 0.9);
        
        lassoButton.append('text')
            .attr('x', 45)
            .attr('y', 19)
            .attr('text-anchor', 'middle')
            .attr('fill', 'white')
            .style('font-size', '12px')
            .style('font-weight', 'bold')
            .style('pointer-events', 'none')
            .text('Lasso: OFF');
        
        // Botón 2: Reset Zoom
        const resetButton = this.svg.append('g')
            .attr('class', 'reset-button')
            .attr('transform', `translate(${this.margin.left + 110}, ${this.margin.top + buttonY})`)
            .style('cursor', 'pointer')
            .on('click', () => this.resetZoom())
            .on('mouseover', function() {
                d3.select(this).select('rect')
                    .transition()
                    .duration(200)
                    .attr('fill', '#5566d9');
            })
            .on('mouseout', function() {
                d3.select(this).select('rect')
                    .transition()
                    .duration(200)
                    .attr('fill', '#667eea');
            });
        
        resetButton.append('rect')
            .attr('width', 80)
            .attr('height', 30)
            .attr('rx', 5)
            .attr('fill', '#667eea')
            .attr('opacity', 0.9);
        
        resetButton.append('text')
            .attr('x', 40)
            .attr('y', 19)
            .attr('text-anchor', 'middle')
            .attr('fill', 'white')
            .style('font-size', '12px')
            .style('font-weight', 'bold')
            .style('pointer-events', 'none')
            .text('Reset Zoom');
        
        // Botón 3: Clear Selection
        const clearButton = this.svg.append('g')
            .attr('class', 'clear-button')
            .attr('transform', `translate(${this.margin.left + 200}, ${this.margin.top + buttonY})`)
            .style('cursor', 'pointer')
            .on('click', () => this.clearSelection())
            .on('mouseover', function() {
                d3.select(this).select('rect')
                    .transition()
                    .duration(200)
                    .attr('fill', '#d95566');
            })
            .on('mouseout', function() {
                d3.select(this).select('rect')
                    .transition()
                    .duration(200)
                    .attr('fill', '#ea6677');
            });
        
        clearButton.append('rect')
            .attr('width', 100)
            .attr('height', 30)
            .attr('rx', 5)
            .attr('fill', '#ea6677')
            .attr('opacity', 0.9);
        
        clearButton.append('text')
            .attr('x', 50)
            .attr('y', 19)
            .attr('text-anchor', 'middle')
            .attr('fill', 'white')
            .style('font-size', '12px')
            .style('font-weight', 'bold')
            .style('pointer-events', 'none')
            .text('Clear Selection');
        
        // Indicador de instrucciones (pequeño)
        this.svg.append('text')
            .attr('x', this.margin.left + 10)
            .attr('y', this.margin.top + buttonY + 45)
            .style('font-size', '10px')
            .style('fill', '#666')
            .text('💡 Drag to pan | Scroll to zoom | Toggle Lasso to select');
    }
    
    clearSelection() {
        // This now delegates to clearAllFilters in main.js
        if (typeof clearAllFilters === 'function') {
            clearAllFilters();
        } else {
            // Fallback
            this.brushGroup.call(this.brush.move, null);
            FilterState.lassoSelection = null;
            applyAllFilters();
        }
        console.log('✓ All filters cleared from universe button');
    }
    
    updateLegend() {
        if (!this.legendContainer) return;

        // Limpiamos la leyenda anterior
        this.legendContainer.selectAll('*').remove();
    
        const mode = this.colorMode;
        // Si no hay escala definida para este modo, salimos
        if (!this.colorScales[mode]) return; 

        const scale = this.colorScales[mode]; 
        
        // --- CONFIGURACIÓN DE TAMAÑO ---
        // Hacemos la barra más ancha (150px) y fina (12px)
        const barWidth = 150; 
        const barHeight = 12;

        // --- 1. TÍTULO (Centrado encima de la barra) ---
        this.legendContainer.append('text')
            .attr('x', barWidth / 2) // Centrado horizontalmente respecto a la barra
            .attr('y', -8)           // Un poco por encima de la barra
            .attr('text-anchor', 'middle') // Alineación centro
            .style('font-size', '12px')
            .style('font-weight', 'bold')
            .attr('fill', 'black') 
            .text(mode.replace(/_/g, ' ').toUpperCase());

        // --- 2. MODO CATEGÓRICO (Discrete) ---
        if (mode === 'mode') {
            const categories = scale.domain();
            
            // Los ponemos en fila horizontal en vez de columna vertical
            categories.forEach((cat, i) => {
                const itemGroup = this.legendContainer.append('g') 
                    .attr('transform', `translate(${i * 65}, 0)`); // Separación horizontal de 65px
            
                itemGroup.append('rect')
                    .attr('width', 12)
                    .attr('height', 12)
                    .attr('fill', scale(cat));

                itemGroup.append('text')
                    .attr('x', 15)
                    .attr('y', 10)
                    .style('font-size', '11px')
                    .attr('fill', 'black')
                    .text(cat);
            });

        } else {
            // --- 3. MODO CONTINUO (Gradiente) ---
            
            // Limpiamos defs anteriores para no acumular basura en el DOM
            this.svg.selectAll(`defs #legend-gradient-${mode.replace('%', '')}`).remove();
        
            const gradientId = "legend-gradient-" + mode.replace('%', '');
            
            // Creamos o seleccionamos las defs
            let defs = this.svg.select("defs");
            if (defs.empty()) {
                defs = this.svg.append("defs");
            }
            
            // Definimos gradiente HORIZONTAL (x1=0% a x2=100%)
            const linearGradient = defs.append("linearGradient")
                .attr("id", gradientId)
                .attr("x1", "0%").attr("y1", "0%") 
                .attr("x2", "100%").attr("y2", "0%");  

            // INVERSIÓN: 100% a la izquierda, 0% a la derecha
            // offset 0% (Izquierda) -> Color del valor 100
            // offset 100% (Derecha) -> Color del valor 0
            [0, 0.5, 1].forEach(t => {
                linearGradient.append("stop")
                    .attr("offset", `${t * 100}%`)
                    // Aquí está el truco: scale((1-t) * 100) invierte los colores
                    // Si t=0 (izq), pedimos color 100. Si t=1 (der), pedimos color 0.
                    .attr("stop-color", scale((1 - t) * 100));
            });

            // Dibujamos el rectángulo con el gradiente
            this.legendContainer.append("rect")
                .attr("width", barWidth)
                .attr("height", barHeight)
                .style("fill", `url(#${gradientId})`)
                .style("stroke", "#ccc") // Borde fino opcional para que se vea mejor sobre blanco
                .style("stroke-width", "0.5px");

            // Texto "100%" a la IZQUIERDA (x=0)
            this.legendContainer.append("text")
                .attr("x", 0)
                .attr("y", barHeight + 12) // Debajo de la barra
                .style("font-size", "10px")
                .attr("text-anchor", "start") // Alineado al inicio
                .attr('fill', 'black')
                .text("100%");
            
            // Texto "0%" a la DERECHA (x=barWidth)
            this.legendContainer.append("text")
                .attr("x", barWidth)
                .attr("y", barHeight + 12) // Debajo de la barra
                .style("font-size", "10px")
                .attr("text-anchor", "end") // Alineado al final
                .attr('fill', 'black')
                .text("0%");
        }
    }

    updateColorMode(mode) {
        console.log('🔵 updateColorMode called with:', mode);
        
        this.colorMode = mode;
        
        // CAMBIO: Actualizar SIN transición (inmediato)
        this.circles.attr('fill', d => this.getColor(d));
        
        // Actualizar leyenda
        this.updateLegend();
        
        // Actualizar histogramas marginales
        this.drawMarginalDistributions();
        
        console.log('✅ Colors updated to', mode);
    }
    
    highlightSongs(songs) {
        const songIds = new Set(songs.map(s => s.track_name));
        
        this.circles
            .transition()
            .duration(500)
            .attr('opacity', d => songIds.has(d.track_name) ? 0.9 : 0.1);
    }
    
    createTooltip() {
        this.tooltip = d3.select('body')
            .append('div')
            .attr('class', 'tooltip')
            .style('opacity', 0);
    }
    
    showTooltip(event, d) {
        this.tooltip
            .transition()
            .duration(200)
            .style('opacity', 1);
        
        // NUEVO: Tooltip actualizado con instrucciones de lasso
        this.tooltip
            .html(`
                <strong>${d.track_name}</strong>
                <div class="tooltip-row">
                    <span>Artist:</span>
                    <span>${d['artist(s)_name']}</span>
                </div>
                <div class="tooltip-row">
                    <span>Streams:</span>
                    <span>${d.streams.toLocaleString()}</span>
                </div>
                <div class="tooltip-row">
                    <span>Mode:</span>
                    <span>${d.mode}</span>
                </div>
                <div class="tooltip-row">
                    <span>Energy:</span>
                    <span>${d['energy_%']}%</span>
                </div>
                <div class="tooltip-row">
                    <span>Danceability:</span>
                    <span>${d['danceability_%']}%</span>
                </div>
                <div class="tooltip-row">
                    <span>Speechiness:</span>
                    <span>${d['speechiness_%']}%</span>
                </div>
                <div class="tooltip-row">
                    <span>Liveness:</span>
                    <span>${d['liveness_%']}%</span>
                </div>
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.3); font-size: 0.85em; color: #ffd700;">
                    💡 Click "Lasso: OFF" button to enable selection
                </div>
            `);
    }

    hideTooltip() {
        this.tooltip
            .transition()
            .duration(200)
            .style('opacity', 0);
    }
}
