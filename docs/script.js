<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HAR Analyzer</title>
    <style>
        .hidden { display: none; }
    </style>
</head>
<body>
    <input type="file" id="harFileInput">
    <select id="sortSelect">
        <option value="startTime">Start Time</option>
        <option value="duration">Duration</option>
        <option value="size">Size</option>
    </select>
    <button id="generateHarButton">Generate HAR File</button>
    <div id="analysisResults" class="hidden">
        <div id="statusIndicator"></div>
        <div id="overviewStats"></div>
        <div id="errorsList"></div>
        <div id="statusCodes"></div>
        <div id="contentTypes"></div>
        <div id="waterfallChart"></div>
    </div>

    <script src="https://d3js.org/d3.v6.min.js"></script>
    <script>
        // Global variables for analysis data
        let timelineData = null;
        let currentSortBy = 'startTime';

        // Initialize event listeners
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('harFileInput').addEventListener('change', handleFileUpload);
            document.getElementById('sortSelect').addEventListener('change', (e) => {
                currentSortBy = e.target.value;
                if (timelineData) {
                    drawWaterfall();
                }
            });

            // Add window resize listener for responsive chart
            window.addEventListener('resize', () => {
                if (timelineData) {
                    drawWaterfall();
                }
            });

            // Add event listener for the generate HAR button
            document.getElementById('generateHarButton').addEventListener('click', generateHarFile);
        });

        // Handle file upload
        function handleFileUpload(event) {
            const file = event.target.files[0];
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    analyzeHar(data);
                    document.getElementById('analysisResults').classList.remove('hidden');
                } catch (error) {
                    console.error("Error parsing HAR file:", error);
                    showError('Invalid HAR file format');
                }
            };

            reader.readAsText(file);
        }

        // Generate HAR file
        function generateHarFile() {
            // Logic to generate HAR file goes here
            // This is a placeholder function; you need to implement the actual logic
            console.log('HAR file generation triggered');
        }

        // Prepare timeline data
        function prepareTimelineData(entries) {
            if (!entries.length) return null;

            const pageStartTime = new Date(entries[0].startedDateTime).getTime();
            
            return entries.map(entry => {
                const startTime = new Date(entry.startedDateTime).getTime();
                const relativeStart = startTime - pageStartTime;
                const duration = entry.time;
                
                const {
                    blocked = 0,
                    dns = 0,
                    connect = 0,
                    ssl = 0,
                    send = 0,
                    wait = 0,
                    receive = 0
                } = entry.timings;

                const timings = [
                    { phase: 'Blocking', start: 0, duration: blocked },
                    { phase: 'DNS', start: blocked, duration: dns },
                    { phase: 'Connecting', start: blocked + dns, duration: connect },
                    { phase: 'SSL', start: blocked + dns + connect, duration: ssl },
                    { phase: 'Sending', start: blocked + dns + connect + ssl, duration: send },
                    { phase: 'Waiting', start: blocked + dns + connect + ssl + send, duration: wait },
                    { phase: 'Receiving', start: blocked + dns + connect + ssl + send + wait, duration: receive }
                ].filter(t => t.duration > 0);

                return {
                    url: entry.request.url.split('?')[0],
                    start: relativeStart,
                    duration: duration,
                    timings: timings,
                    type: entry.response.content.mimeType?.split(';')[0] || 'unknown',
                    size: entry.response.bodySize || 0,
                    status: entry.response.status,
                    isBlocking: entry.request.url.endsWith('.css') || entry.request.url.endsWith('.js')
                };
            });
        }

        // Draw waterfall chart
        function drawWaterfall() {
            if (!timelineData) return;

            const chartContainer = document.getElementById('waterfallChart');
            chartContainer.innerHTML = '';

            // Sort data based on selected criterion
            const sortedData = [...timelineData].sort((a, b) => {
                if (currentSortBy === "startTime") return a.start - b.start;
                if (currentSortBy === "duration") return b.duration - a.duration;
                if (currentSortBy === "size") return b.size - a.size;
                return 0;
            });

            const margin = { top: 20, right: 20, bottom: 30, left: 200 };
            const width = chartContainer.clientWidth - margin.left - margin.right;
            const height = Math.max(400, sortedData.length * 25);
            
            // Create SVG
            const svg = d3.select(chartContainer)
                .append("svg")
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
                .append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);

            // Create scales
            const xScale = d3.scaleLinear()
                .domain([0, d3.max(sortedData, d => d.start + d.duration)])
                .range([0, width]);

            const yScale = d3.scaleBand()
                .domain(sortedData.map((_, i) => i))
                .range([0, height])
                .padding(0.1);

            // Color scale for timing phases
            const phaseColorScale = d3.scaleOrdinal()
                .domain(['Blocking', 'DNS', 'Connecting', 'SSL', 'Sending', 'Waiting', 'Receiving'])
                .range(['#636e72', '#74b9ff', '#55efc4', '#ffeaa7', '#fab1a0', '#fd79a8', '#a29bfe']);

            // Add waterfall bars
            const barGroups = svg.selectAll(".bar-group")
                .data(sortedData)
                .enter()
                .append("g")
                .attr("class", "bar-group");

            // Add timing phase segments
            barGroups.each(function(d, i) {
                const g = d3.select(this);
                
                // Draw timing segments
                d.timings.forEach(timing => {
                    g.append("rect")
                        .attr("x", xScale(d.start + timing.start))
                        .attr("y", yScale(i))
                        .attr("width", Math.max(0.5, xScale(timing.duration) - xScale(0)))
                        .attr("height", yScale.bandwidth())
                        .attr("fill", phaseColorScale(timing.phase))
                        .append("title")
                        .text(`${timing.phase}: ${timing.duration.toFixed(2)}ms`);
                });

                // Indicate blocking resources
                if (d.isBlocking) {
                    g.append("rect")
                        .attr("x", xScale(d.start))
                        .attr("y", yScale(i))
                        .attr("width", xScale(d.duration) - xScale(0))
                        .attr("height", yScale.bandwidth())
                        .attr("fill", "none")
                        .attr("stroke", "#e84393")
                        .attr("stroke-width", 2)
                        .attr("stroke-dasharray", "4,4");
                }

                // Add URL labels
                g.append("text")
                    .attr("x", -5)
                    .attr("y", yScale(i) + yScale.bandwidth() / 2)
                    .attr("text-anchor", "end")
                    .attr("dominant-baseline", "middle")
                    .attr("font-size", "12px")
                    .text(d.url.split('/').pop());
            });

            // Add legend
            const legendData = ['Blocking', 'DNS', 'Connecting', 'SSL', 'Sending', 'Waiting', 'Receiving'];
            const legend = svg.append("g")
                .attr("transform", `translate(${width - 150}, -15)`);

            legendData.forEach((phase, i) => {
                const legendItem = legend.append("g")
                    .attr("transform", `translate(${Math.floor(i/4) * 75}, ${(i%4) * 15})`);

                legendItem.append("rect")
                    .attr("width", 10)
                    .attr("height", 10)
                    .attr("fill", phaseColorScale(phase));

                legendItem.append("text")
                    .attr("x", 15)
                    .attr("y", 9)
                    .attr("font-size", "12px")
                    .text(phase);
            });

            // Add x-axis
            const xAxis = d3.axisBottom(xScale)
                .tickFormat(d => `${d}ms`);

            svg.append("g")
                .attr("transform", `translate(0,${height})`)
                .call(xAxis);
        }

        // Analyze HAR file
        function analyzeHar(data) {
            if (!data?.log?.entries) {
                showError('Missing required HAR structure');
                return;
            }

            const entries = data.log.entries;
            timelineData = prepareTimelineData(entries);

            const errors = [];

            // Check for HTTP errors
            const httpErrors = entries.filter(entry => entry.response.status >= 400);
            const slowResponses = entries.filter(entry => entry.time > 1000);
            const largeResponses = entries.filter(entry => (entry.response.bodySize || 0) > 5 * 1024 * 1024);
            const blockingResources = entries.filter(entry => 
                entry.request.url.endsWith('.css') || 
                (entry.request.url.endsWith('.js') && !entry.request.url.includes('async'))
            );

            // Add errors to list
            httpErrors.forEach(entry => {
                errors.push({
                    type: 'HTTP Error',
                    message: `${entry.request.method} ${entry.request.url} returned status ${entry.response.status}`,
                    details: entry.response.statusText
                });
            });

            slowResponses.forEach(entry => {
                errors.push({
                    type: 'Performance Warning',
                    message: `Slow response (${Math.round(entry.time)}ms) for ${entry.request.url}`,
                    details: 'Expected < 1000ms'
                });
            });

            largeResponses.forEach(entry => {
                errors.push({
                    type: 'Size Warning',
                    message: `Large response (${Math.round(entry.response.bodySize / 1024 / 1024)}MB) for ${entry.request.url}`,
                    details: 'Expected < 5MB'
                });
            });

            if (blockingResources.length > 0) {
                errors.push({
                    type: 'Performance Warning',
                    message: `Found ${blockingResources.length} render-blocking resources`,
                    details: 'Consider using async/defer for scripts or preload for critical CSS'
                });
            }

            // Update UI with analysis results
            updateErrorsSection(errors);
            updateStatusIndicator(errors.length === 0);

            // Calculate statistics
            const analysis = {
                totalRequests: entries.length,
                totalSize: entries.reduce((sum, entry) => sum + (entry.response.bodySize || 0), 0) / 1024,
                averageResponseTime: entries.reduce((sum, entry) => sum + entry.time, 0) / entries.length,
                contentTypes: entries.reduce((types, entry) => {
                    const contentType = entry.response.content.mimeType?.split(';')[0] || 'unknown';
                    types[contentType] = (types[contentType] || 0) + 1;
                    return types;
                }, {}),
                statusGroups: entries.reduce((groups, entry) => {
                    const status = entry.response.status;
                    const statusCategory = Math.floor(status / 100) * 100;
                    const statusKey = `${statusCategory}-${statusCategory + 99}`;
                    
                    if (!groups[statusKey]) {
                        groups[statusKey] = {
                            count: 0,
                            details: {}
                        };
                    }
                    
                    groups[statusKey].count++;
                    
                    if (!groups[statusKey].details[status]) {
                        groups[statusKey].details[status] = 0;
                    }
                    groups[statusKey].details[status]++;
                    
                    return groups;
                }, {}),
                errorCount: httpErrors.length,
                slowResponseCount: slowResponses.length,
                largeResponseCount: largeResponses.length,
                blockingResourceCount: blockingResources.length
            };

            updateAnalysisUI(analysis);
            
            // Explicitly call drawWaterfall() after preparing the timeline data
            if (timelineData) {
                drawWaterfall();
            }
        }

        // Update UI components
        function updateErrorsSection(errors) {
            const errorsList = document.getElementById('errorsList');
            errorsList.innerHTML = '';

            if (errors.length === 0) {
                errorsList.innerHTML = '<div class="text-green-500">No issues found!</div>';
                return;
            }

            errors.forEach(error => {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'p-4 bg-red-50 rounded-lg mb-4';
                errorDiv.innerHTML = `
                    <h3 class="font-semibold">${error.type}</h3>
                    <p class="text-gray-600">${error.message}</p>
                    ${error.details ? `<p class="text-sm text-gray-500 mt-1">${error.details}</p>` : ''}
                `;
                errorsList.appendChild(errorDiv);
            });
        }

        function updateStatusIndicator(isSuccess) {
            const indicator = document.getElementById('statusIndicator');
            indicator.innerHTML = isSuccess 
                ? '<div class="flex items-center text-green-500"><svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>All checks passed!</div>'
                : '<div class="flex items-center text-red-500"><svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>Issues found</div>';
        }

        function updateAnalysisUI(analysis) {
            // Update Overview
            document.getElementById('overviewStats').innerHTML = `
                <p>Total Requests: ${analysis.totalRequests}</p>
                <p>Total Size: ${analysis.totalSize.toFixed(2)} KB</p>
                <p>Average Response Time: ${analysis.averageResponseTime.toFixed(2)} ms</p>
                <p>HTTP Errors: ${analysis.errorCount}</p>
                <p>Slow Responses: ${analysis.slowResponseCount}</p>
                <p>Large Responses: ${analysis.largeResponseCount}</p>
                <p>Blocking Resources: ${analysis.blockingResourceCount}</p>
            `;

            // Update Status Codes
            const statusCodesDiv = document.getElementById('statusCodes');
            statusCodesDiv.innerHTML = Object.entries(analysis.statusGroups)
                .sort()
                .map(([range, data]) => `
                    <div>
                        <h3 class="font-semibold">${range} (${data.count} requests)</h3>
                        <div class="ml-4 space-y-1">
                            ${Object.entries(data.details)
                                .sort()
                                .map(([status, count]) => `
                                    <div class="flex justify-between text-sm">
                                        <span>Status ${status}</span>
                                        <span>${count}</span>
                                    </div>
                                `).join('')}
                        </div>
                    </div>
                `).join('');

            // Update Content Types
            const contentTypesDiv = document.getElementById('contentTypes');
            contentTypesDiv.innerHTML = Object.entries(analysis.contentTypes)
                .map(([type, count]) => `
                    <div class="flex justify-between mb-2">
                        <span>${type}</span>
                        <span>${count}</span>
                    </div>
                `).join('');
        }

        function showError(message) {
            const errorsList = document.getElementById('errorsList');
            errorsList.innerHTML = `<div class="p-4 bg-red-50 rounded-lg">${message}</div>`;
            document.getElementById('analysisResults').classList.remove('hidden');
        }
    </script>
</body>
</html>
