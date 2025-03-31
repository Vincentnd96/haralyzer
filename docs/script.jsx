import * as React from "react";
import { createRoot } from "react-dom/client";
import * as d3 from "d3";
import { 
  SparkApp, 
  PageContainer,
  Button, 
  Card,
  Input,
  Select
} from "@github/spark/components";
import { Upload, Table, ChartLine, Warning, Clock, CheckCircle, ArrowsDownUp, Globe } from "@phosphor-icons/react";

// Main application component
function App() {
  // State for storing HAR data, analysis results, errors, and timeline view
  const [harData, setHarData] = React.useState(null);
  const [analysis, setAnalysis] = React.useState(null);
  const [errors, setErrors] = React.useState([]);
  const [timelineData, setTimelineData] = React.useState(null);
  const [sortBy, setSortBy] = React.useState("startTime");
  const timelineRef = React.useRef(null);
  const waterfallRef = React.useRef(null);

  // Handle file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        setHarData(data);
        analyzeHar(data);
      } catch (error) {
        console.error("Error parsing HAR file:", error);
        setErrors([{ type: 'Parse Error', message: 'Invalid HAR file format' }]);
      }
    };

    reader.readAsText(file);
  };

  // Prepare timeline data with dependency analysis
  const prepareTimelineData = (entries) => {
    if (!entries.length) return null;

    const pageStartTime = new Date(entries[0].startedDateTime).getTime();
    
    return entries.map(entry => {
      const startTime = new Date(entry.startedDateTime).getTime();
      const relativeStart = startTime - pageStartTime;
      const duration = entry.time;
      
      // Break down timing phases
      const {
        blocked = 0,
        dns = 0,
        connect = 0,
        ssl = 0,
        send = 0,
        wait = 0,
        receive = 0
      } = entry.timings;

      // Calculate cumulative timings for waterfall chart
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
        type: entry.response.content.mimeType.split(';')[0],
        size: entry.response.bodySize || 0,
        status: entry.response.status,
        isBlocking: entry.request.url.endsWith('.css') || entry.request.url.endsWith('.js') // Simplified blocking resource detection
      };
    });
  };

  // Draw waterfall chart visualization using D3
  const drawWaterfall = React.useCallback(() => {
    if (!timelineData || !waterfallRef.current) return;

    // Clear previous visualization
    d3.select(waterfallRef.current).selectAll("*").remove();

    // Sort data based on selected criterion
    const sortedData = [...timelineData].sort((a, b) => {
      if (sortBy === "startTime") return a.start - b.start;
      if (sortBy === "duration") return b.duration - a.duration;
      if (sortBy === "size") return b.size - a.size;
      return 0;
    });

    const margin = { top: 20, right: 20, bottom: 30, left: 200 };
    const width = waterfallRef.current.clientWidth - margin.left - margin.right;
    const height = Math.max(400, sortedData.length * 25);
    
    const svg = d3.select(waterfallRef.current)
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
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
    svg.selectAll(".bar-group")
      .data(sortedData)
      .enter()
      .append("g")
      .attr("class", "bar-group")
      .each(function(d, i) {
        const g = d3.select(this);
        
        // Draw timing phase segments
        d.timings.forEach(timing => {
          g.append("rect")
            .attr("x", xScale(d.start + timing.start))
            .attr("y", yScale(i))
            .attr("width", Math.max(0.5, xScale(timing.duration) - xScale(0))) // Minimum width for visibility
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

        // URL labels
        g.append("text")
          .attr("x", -5)
          .attr("y", yScale(i) + yScale.bandwidth() / 2)
          .attr("text-anchor", "end")
          .attr("dominant-baseline", "middle")
          .attr("class", "text-xs")
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
        .attr("class", "text-xs")
        .text(phase);
    });

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => `${d}ms`);

    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(xAxis);
  }, [timelineData, sortBy]);

  // Analyze HAR file and generate metrics
  const analyzeHar = (data) => {
    if (!data?.log?.entries) {
      setErrors([{ type: 'Structure Error', message: 'Missing required HAR structure' }]);
      return;
    }

    const entries = data.log.entries;
    setTimelineData(prepareTimelineData(entries));

    const foundErrors = [];

    // Check for HTTP errors
    const httpErrors = entries.filter(entry => {
      const status = entry.response.status;
      return status >= 400;
    });

    // Check for slow responses (> 1000ms)
    const slowResponses = entries.filter(entry => entry.time > 1000);

    // Check for large responses (> 5MB)
    const largeResponses = entries.filter(entry => 
      (entry.response.bodySize || 0) > 5 * 1024 * 1024
    );

    // Check for render-blocking resources
    const blockingResources = entries.filter(entry => 
      entry.request.url.endsWith('.css') || 
      (entry.request.url.endsWith('.js') && !entry.request.url.includes('async'))
    );

    // Add found errors to the list
    httpErrors.forEach(entry => {
      foundErrors.push({
        type: 'HTTP Error',
        message: `${entry.request.method} ${entry.request.url} returned status ${entry.response.status}`,
        details: entry.response.statusText
      });
    });

    slowResponses.forEach(entry => {
      foundErrors.push({
        type: 'Performance Warning',
        message: `Slow response (${Math.round(entry.time)}ms) for ${entry.request.url}`,
        details: `Expected < 1000ms`
      });
    });

    largeResponses.forEach(entry => {
      foundErrors.push({
        type: 'Size Warning',
        message: `Large response (${Math.round(entry.response.bodySize / 1024 / 1024)}MB) for ${entry.request.url}`,
        details: 'Expected < 5MB'
      });
    });

    if (blockingResources.length > 0) {
      foundErrors.push({
        type: 'Performance Warning',
        message: `Found ${blockingResources.length} render-blocking resources`,
        details: 'Consider using async/defer for scripts or preload for critical CSS'
      });
    }

    setErrors(foundErrors);

    // Group requests by HTTP status code
    const statusGroups = entries.reduce((groups, entry) => {
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
      
      // Track individual status codes within the category
      if (!groups[statusKey].details[status]) {
        groups[statusKey].details[status] = 0;
      }
      groups[statusKey].details[status]++;
      
      return groups;
    }, {});

    const analysis = {
      totalRequests: entries.length,
      totalSize: entries.reduce((sum, entry) => 
        sum + (entry.response.bodySize || 0), 0) / 1024,
      averageResponseTime: entries.reduce((sum, entry) => 
        sum + entry.time, 0) / entries.length,
      contentTypes: entries.reduce((types, entry) => {
        const contentType = entry.response.content.mimeType.split(';')[0];
        types[contentType] = (types[contentType] || 0) + 1;
        return types;
      }, {}),
      statusGroups,
      errorCount: httpErrors.length,
      slowResponseCount: slowResponses.length,
      largeResponseCount: largeResponses.length,
      blockingResourceCount: blockingResources.length
    };

    setAnalysis(analysis);
  };

  // Update waterfall when data or sort criteria changes
  React.useEffect(() => {
    drawWaterfall();
  }, [timelineData, sortBy, drawWaterfall]);

  return (
    <SparkApp>
      <PageContainer maxWidth="large">
        <div className="space-y-6">
          {/* Header section */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">HAR File Analyzer</h1>
            <p className="text-fg-secondary">
              Upload a HAR file to analyze web performance metrics and identify issues
            </p>
          </div>

          {/* File upload section */}
          <Card>
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Upload HAR File</h2>
              <div className="flex items-center gap-4">
                <Input
                  type="file"
                  accept=".har"
                  onChange={handleFileUpload}
                  icon={<Upload />}
                />
              </div>
            </div>
          </Card>

          {/* Waterfall chart section */}
          {timelineData && (
            <Card>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <ArrowsDownUp /> Waterfall Chart
                  </h2>
                  <Select 
                    value={sortBy} 
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="startTime">Sort by Start Time</option>
                    <option value="duration">Sort by Duration</option>
                    <option value="size">Sort by Size</option>
                  </Select>
                </div>
                <div 
                  ref={waterfallRef} 
                  className="w-full overflow-x-auto"
                  style={{ minHeight: "400px" }}
                />
              </div>
            </Card>
          )}

          {/* Errors section */}
          {analysis && (
            <Card>
              <div className="space-y-4">
                {errors.length > 0 ? (
                  <>
                    <h2 className="text-xl font-semibold flex items-center gap-2 text-accent-9">
                      <Warning /> Issues Found ({errors.length})
                    </h2>
                    <div className="space-y-4">
                      {errors.map((error, index) => (
                        <div key={index} className="p-4 bg-accent-3 rounded-lg">
                          <h3 className="font-semibold">{error.type}</h3>
                          <p className="text-fg-secondary">{error.message}</p>
                          {error.details && (
                            <p className="text-sm text-fg-secondary mt-1">{error.details}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-green-500">
                    <CheckCircle className="w-6 h-6" />
                    <span className="text-xl font-semibold">No issues found!</span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Analysis results section */}
          {analysis && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Overview metrics */}
              <Card>
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Table /> Overview
                  </h2>
                  <div className="space-y-2">
                    <p>Total Requests: {analysis.totalRequests}</p>
                    <p>Total Size: {analysis.totalSize.toFixed(2)} KB</p>
                    <p>Average Response Time: {analysis.averageResponseTime.toFixed(2)} ms</p>
                    <p>HTTP Errors: {analysis.errorCount}</p>
                    <p>Slow Responses: {analysis.slowResponseCount}</p>
                    <p>Large Responses: {analysis.largeResponseCount}</p>
                    <p>Blocking Resources: {analysis.blockingResourceCount}</p>
                  </div>
                </div>
              </Card>

              {/* HTTP Status Summary */}
              <Card>
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Globe /> HTTP Status Codes
                  </h2>
                  <div className="space-y-2">
                    {Object.entries(analysis.statusGroups).sort().map(([range, data]) => (
                      <div key={range}>
                        <h3 className="font-semibold">{range} ({data.count} requests)</h3>
                        <div className="ml-4 space-y-1">
                          {Object.entries(data.details).sort().map(([status, count]) => (
                            <div key={status} className="flex justify-between text-sm">
                              <span>Status {status}</span>
                              <span>{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Content type breakdown */}
              <Card>
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <ChartLine /> Content Types
                  </h2>
                  <div className="space-y-2">
                    {Object.entries(analysis.contentTypes).map(([type, count]) => (
                      <div key={type} className="flex justify-between">
                        <span>{type}</span>
                        <span>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </PageContainer>
    </SparkApp>
  );
}

// Render the application
const root = createRoot(document.getElementById("root"));
root.render(<App />);

