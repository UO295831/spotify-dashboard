// src/js/battleground.js

/**
 * BattlegroundView - Platform Comparison Bar Chart
 * 
 * Displays total playlist reach across:
 * - Spotify (green)
 * - Apple Music (red)
 * - Deezer (purple)
 * 
 * Updates when songs are selected in Universe view
 * Clicking on a bar triggers filtering in Universe
 */

class BattlegroundView {
    constructor(containerId, data) {
        this.containerId = containerId;
        this.data = data;
        this.margin = {top: 20, right: 30, bottom: 60, left: 80};
        
        // Platform colors (official brand colors)
        this.platformColors = {
            'Spotify': '#1DB954',      // Spotify green
            'Apple Music': '#FA243C',  // Apple Music red
            'Deezer': '#FF0092'        // Deezer purple/pink
        };
        
        this.init();
    }
    
    init() {
        // Get container dimensions
        const container = d3.select(this.containerId);
        const bbox = container.node().getBoundingClientRect();
        
        this.width = bbox.width - this.margin.left - this.margin.right;
        this.height = bbox.height - this.margin.top - this.margin.bottom;
        
        // Create SVG
        this.svg = container.append('svg')
            .attr('width', bbox.width)
            .attr('height', bbox.height);
        
        this.g = this.svg.append('g')
            .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`);
        
        // Initial render
        this.render(this.data);
        
        console.log('✓ Battleground view initialized');
    }
    
    update(selectedData) {
        // Clear previous visualization
        this.g.selectAll('*').remove();
        
        // Render with new data
        this.render(selectedData);
    }
    
    render(data) {
        const self = this;
        
        // Calculate platform totals
        const platformData = [
            {
                platform: 'Spotify',
                playlists: d3.mean(data, d => d.in_spotify_playlists || 0),
                color: this.platformColors['Spotify']
            },
            {
                platform: 'Apple Music',
                playlists: d3.mean(data, d => d.in_apple_playlists || 0),
                color: this.platformColors['Apple Music']
            },
            {
                platform: 'Deezer',
                playlists: d3.mean(data, d => d.in_deezer_playlists || 0),
                color: this.platformColors['Deezer']
            }
        ];
        
        // Create scales
        const xScale = d3.scaleBand()
            .domain(platformData.map(d => d.platform))
            .range([0, this.width])
            .padding(0.3);
        
        const yScale = d3.scaleLinear()
            .domain([0, d3.max(platformData, d => d.playlists)])
            .range([this.height, 0])
            .nice();
        
        // Draw axes
        this.drawAxes(xScale, yScale);
        
        // Draw bars
        this.drawBars(platformData, xScale, yScale);
        
        // Add value labels on top of bars
        this.addValueLabels(platformData, xScale, yScale);
    }
    
    drawAxes(xScale, yScale) {
        // X axis
        this.g.append('g')
            .attr('class', 'axis')
            .attr('transform', `translate(0, ${this.height})`)
            .call(d3.axisBottom(xScale))
            .selectAll('text')
            .attr('font-size', '12px')
            .attr('font-weight', 'bold');
        
        // Y axis
        this.g.append('g')
            .attr('class', 'axis')
            .call(d3.axisLeft(yScale)
                .ticks(5)
                .tickFormat(d => {
                    // Format large numbers (e.g., 10000 → 10K)
                    if (d >= 1000000) {
                        return (d / 1000000).toFixed(1) + 'M';
                    } else if (d >= 1000) {
                        return (d / 1000).toFixed(0) + 'K';
                    }
                    return d;
                })
            );
        
        // Y axis label
        this.g.append('text')
            .attr('class', 'axis-label')
            .attr('transform', 'rotate(-90)')
            .attr('x', -this.height / 2)
            .attr('y', -60)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('font-weight', 'bold')
            .attr('fill', '#333')
            .text('Average Playlists per Song');
        
        // Grid lines
        this.g.append('g')
            .attr('class', 'grid')
            .call(d3.axisLeft(yScale)
                .ticks(5)
                .tickSize(-this.width)
                .tickFormat('')
            )
            .style('stroke-opacity', 0.1);
    }
    
    drawBars(platformData, xScale, yScale) {
        const self = this;
        
        // Create bars
        const bars = this.g.selectAll('rect.bar')
            .data(platformData)
            .enter()
            .append('rect')
            .attr('class', 'bar')
            .attr('x', d => xScale(d.platform))
            .attr('y', this.height)  // Start from bottom for animation
            .attr('width', xScale.bandwidth())
            .attr('height', 0)  // Start with 0 height for animation
            .attr('fill', d => d.color)
            .attr('opacity', 0.8)
            .attr('rx', 5)  // Rounded corners
            .style('cursor', 'pointer');
        
        // Animate bars growing from bottom
        bars.transition()
            .duration(800)
            .delay((d, i) => i * 100)
            .attr('y', d => yScale(d.playlists))
            .attr('height', d => this.height - yScale(d.playlists));
        
        // Add interactivity
        bars
            .on('mouseover', function(event, d) {
                // Highlight bar
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr('opacity', 1)
                    .attr('transform', 'scale(1.05)');
                
                // Show tooltip
                self.showTooltip(event, d);
            })
            .on('mouseout', function() {
                // Return to normal
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr('opacity', 0.8)
                    .attr('transform', 'scale(1)');
                
                // Hide tooltip
                self.hideTooltip();
            })
            .on('click', function(event, d) {
                // Highlight the clicked bar
                d3.selectAll('rect.bar')
                    .transition()
                    .duration(300)
                    .attr('opacity', 0.3);
                
                d3.select(this)
                    .transition()
                    .duration(300)
                    .attr('opacity', 1);
                
                // Trigger platform filter in main app
                if (typeof handlePlatformClick === 'function') {
                    handlePlatformClick(d.platform);
                }
                
                // Reset after 2 seconds
                setTimeout(() => {
                    d3.selectAll('rect.bar')
                        .transition()
                        .duration(300)
                        .attr('opacity', 0.8);
                }, 2000);
            });
    }
    
    addValueLabels(platformData, xScale, yScale) {
        // Add value labels on top of bars
        this.g.selectAll('text.value-label')
            .data(platformData)
            .enter()
            .append('text')
            .attr('class', 'value-label')
            .attr('x', d => xScale(d.platform) + xScale.bandwidth() / 2)
            .attr('y', d => yScale(d.playlists) - 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('font-weight', 'bold')
            .attr('fill', '#333')
            .attr('opacity', 0)
            .text(d => {
                // Format the number
                if (d.playlists >= 1000000) {
                    return (d.playlists / 1000000).toFixed(1) + 'M';
                } else if (d.playlists >= 1000) {
                    return (d.playlists / 1000).toFixed(0) + 'K';
                }
                return d.playlists.toLocaleString();
            })
            .transition()
            .duration(800)
            .delay((d, i) => i * 100 + 400)
            .attr('opacity', 1);
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
                <strong>${d.platform}</strong><br>
                Total Playlists: <strong>${d.playlists.toLocaleString()}</strong><br>
                <em style="font-size: 0.85em; color: #ccc;">Click to highlight top performers</em>
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
