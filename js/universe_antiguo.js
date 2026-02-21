// src/js/universe.js

class UniverseView {
    constructor(containerId, data) {
        this.containerId = containerId;
        this.data = data;
        this.colorMode = 'mode';
        this.margin = {top: 20, right: 20, bottom: 60, left: 60};
        
        this.init();
    }
    
    init() {
        // Get container
        const container = d3.select(this.containerId);
        const bbox = container.node().getBoundingClientRect();
        
        this.width = bbox.width - this.margin.left - this.margin.right;
        this.height = bbox.height - this.margin.top - this.margin.bottom;
        
        // Create SVG
        this.svg = container.append('svg')
            .attr('width', bbox.width)
            .attr('height', bbox.height);
        
        this.g = this.svg.append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);
        
        // Create scales
        this.createScales();
        
        // Draw components
        this.drawAxes();
        this.drawPoints();
        this.addBrush();
        this.createTooltip();
        
        console.log('✓ Universe view initialized');
    }
    
    createScales() {
        // X scale
        this.xScale = d3.scaleLinear()
            .domain(d3.extent(this.data, d => d.tsne_1))
            .range([0, this.width])
            .nice();
        
        // Y scale
        this.yScale = d3.scaleLinear()
            .domain(d3.extent(this.data, d => d.tsne_2))
            .range([this.height, 0])
            .nice();
        
        // Size scale (by streams)
        this.sizeScale = d3.scaleSqrt()
            .domain(d3.extent(this.data, d => d.streams))
            .range([3, 20]);
        
        // Color scales
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
                .domain([0, 100])
        };
    }
    
    drawAxes() {
        // X axis
        this.g.append('g')
            .attr('class', 'axis')
            .attr('transform', `translate(0,${this.height})`)
            .call(d3.axisBottom(this.xScale).ticks(8))
            .append('text')
            .attr('class', 'axis-label')
            .attr('x', this.width / 2)
            .attr('y', 40)
            .text('t-SNE Dimension 1');
        
        // Y axis
        this.g.append('g')
            .attr('class', 'axis')
            .call(d3.axisLeft(this.yScale).ticks(8))
            .append('text')
            .attr('class', 'axis-label')
            .attr('transform', 'rotate(-90)')
            .attr('x', -this.height / 2)
            .attr('y', -40)
            .text('t-SNE Dimension 2');
        
        // Grid
        this.g.append('g')
            .attr('class', 'grid')
            .call(d3.axisLeft(this.yScale)
                .tickSize(-this.width)
                .tickFormat('')
            );
        
        this.g.append('g')
            .attr('class', 'grid')
            .attr('transform', `translate(0,${this.height})`)
            .call(d3.axisBottom(this.xScale)
                .tickSize(-this.height)
                .tickFormat('')
            );
    }
    
    drawPoints() {
        const self = this;
        
        this.circles = this.g.selectAll('circle.song-point')
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
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr('opacity', 1)
                    .attr('stroke-width', 2);
                
                self.showTooltip(event, d);
            })
            .on('mouseout', function() {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr('opacity', 0.7)
                    .attr('stroke-width', 1);
                
                self.hideTooltip();
            });
    }
    
    getColor(d) {
        if (this.colorMode === 'mode') {
            return this.colorScales.mode(d.mode);
        } else {
            return this.colorScales[this.colorMode](d[this.colorMode]);
        }
    }
    
    addBrush() {
        const self = this;
        
        const brush = d3.brush()
            .extent([[0, 0], [this.width, this.height]])
            .on('end', function(event) {
                self.onBrush(event);
            });
        
        this.g.append('g')
            .attr('class', 'brush')
            .call(brush);
    }
    
    onBrush(event) {
        if (!event.selection) {
            // No selection - reset
            this.circles.attr('opacity', 0.7);
            handleSelection(this.data);
            return;
        }
        
        const [[x0, y0], [x1, y1]] = event.selection;
        
        // Find selected points
        const selected = [];
        
        this.circles.attr('opacity', d => {
            const cx = this.xScale(d.tsne_1);
            const cy = this.yScale(d.tsne_2);
            const isSelected = cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
            
            if (isSelected) {
                selected.push(d);
                return 0.9;  // Selected
            }
            return 0.1;  // Ghost effect!
        });
        
        // Notify other views
        handleSelection(selected);
    }
    
    updateColorMode(mode) {
        this.colorMode = mode;
        
        this.circles
            .transition()
            .duration(750)
            .attr('fill', d => this.getColor(d));
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
            `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
    }
    
    hideTooltip() {
        this.tooltip
            .transition()
            .duration(200)
            .style('opacity', 0);
    }
}