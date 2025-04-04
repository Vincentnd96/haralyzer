// Global variables for analysis data
let timelineData = null;
let currentSortBy = 'startTime';
let githubRequestIds = [];  // New array to store GitHub request IDs

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
});

// Handle file upload
function handleFileUpload(event) {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            // Extract GitHub request IDs before analysis
            githubRequestIds = data.log.entries
                .filter(entry => entry.request.headers.some(h => h.name.toLowerCase() === 'x-github-request-id'))
                .map(entry => ({
                    url: entry.request.url,
                    id: entry.request.headers.find(h => h.name.toLowerCase() === 'x-github-request-id').value
                }));
            analyzeHar(data);
            document.getElementById('analysisResults').classList.remove('hidden');
        } catch (error) {
            console.error("Error parsing HAR file:", error);
            showError('Invalid HAR file format');
        }
    };

    reader.readAsText(file);
}

// Rest of the original functions...
[Previous functions remain exactly the same until updateAnalysisUI]

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
        ${githubRequestIds.length > 0 ? `<p>GitHub Request IDs Found: ${githubRequestIds.length}</p>` : ''}
    `;

    // Display GitHub Request IDs if any found
    if (githubRequestIds.length > 0) {
        const requestIdsHtml = githubRequestIds
            .map(item => `
                <div class="flex justify-between items-center p-2 border-b">
                    <span class="font-mono text-sm">${item.id}</span>
                    <span class="text-sm text-gray-600 truncate ml-4">${item.url}</span>
                </div>
            `)
            .join('');
        
        // Create or update GitHub Request IDs section
        let githubSection = document.getElementById('githubRequestIds');
        if (!githubSection) {
            githubSection = document.createElement('div');
            githubSection.id = 'githubRequestIds';
            githubSection.className = 'bg-white rounded-lg shadow p-6 mb-6';
            document.getElementById('analysisResults').insertBefore(
                githubSection,
                document.getElementById('errorsSection')
            );
        }
        
        githubSection.innerHTML = `
            <h2 class="text-xl font-semibold mb-4">GitHub Request IDs</h2>
            <div class="max-h-60 overflow-y-auto">
                ${requestIdsHtml}
            </div>
        `;
    }

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

[[[refinement_start]]] Add ability to filter the waterfall chart by request type (XHR, Document, StyleSheet, etc) [[[refinement_end]]]
[[[refinement_start]]] Add a "Copy Request ID" button next to each GitHub request ID [[[refinement_end]]]
[[[refinement_start]]] Add a timeline view showing the distribution of requests over time with the ability to zoom into specific time ranges [[[refinement_end]]]null
