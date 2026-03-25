require('dotenv').config();
const nodeHtmlToImage = require('node-html-to-image');

/**
 * Builds the HTML template for the Route Report.
 */
function buildRouteReportHTML(sessionData) {
    const { driverName, vehicleRoutes, isEdited } = sessionData;
    const dateStr = new Date().toLocaleString('en-US', { timeZoneName: 'short' });

    const editBanner = isEdited ? `<div class="edit-banner">⚠️ CORRECTED REPORT</div>` : '';
    
    vehicleRoutes.forEach(entry => {
        const { make, nickname, registration, branch, routes, reported_distance_km } = entry;
        
        let routesHtml = '';
        if (routes.length === 0) {
            routesHtml = '<div class="no-routes">No route reported</div>';
        } else {
            routes.forEach(r => {
                const distAttr = r.distance_km != null ? ` (${r.distance_km} km)` : '';
                routesHtml += `<span class="route-badge">${r.name}${distAttr}</span>`;
            });
        }

        vehicleCardsHtml += `
        <div class="vehicle-card">
            <div class="vehicle-header">
                <span class="vehicle-name">${make} ${nickname}</span>
                <span class="vehicle-reg">${registration} — ${branch}</span>
            </div>
            <div class="distance-row">
                <span class="label">Total Distance:</span>
                <span class="value">${reported_distance_km} km</span>
            </div>
            <div class="routes-container">
                ${routesHtml}
            </div>
        </div>
        `;
    });

    return `
    <html>
      <head>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f0f2f5;
            margin: 0;
            padding: 30px;
            color: #1c1e21;
            width: 900px;
          }
          .report-container {
            background-color: #fff;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          }
          .header {
            text-align: center;
            border-bottom: 3px solid #007bff;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .header h1 {
            margin: 0;
            color: #007bff;
            font-size: 2.5em;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .edit-banner {
            background-color: #fff3cd;
            color: #856404;
            border: 1px solid #ffeeba;
            padding: 10px;
            text-align: center;
            font-weight: bold;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 1.2em;
          }
          .meta-info {
            display: flex;
            justify-content: space-between;
            background-color: #f8f9fa;
            padding: 15px 25px;
            border-radius: 8px;
            margin-bottom: 30px;
            border-left: 5px solid #007bff;
          }
          .meta-item .label {
            font-weight: bold;
            color: #65676b;
            font-size: 0.9em;
            text-transform: uppercase;
          }
          .meta-item .value {
            font-size: 1.2em;
            color: #050505;
            margin-top: 4px;
            font-weight: 600;
          }
          .vehicle-card {
            background-color: #ffffff;
            border: 1px solid #e4e6eb;
            border-radius: 10px;
            margin-bottom: 20px;
            overflow: hidden;
          }
          .vehicle-header {
            background-color: #007bff;
            color: white;
            padding: 12px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .vehicle-name {
            font-size: 1.3em;
            font-weight: bold;
          }
          .vehicle-reg {
            font-size: 0.9em;
            opacity: 0.9;
          }
          .distance-row {
            padding: 15px 20px;
            border-bottom: 1px dashed #e4e6eb;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .distance-row .label {
            font-weight: bold;
            color: #65676b;
          }
          .distance-row .value {
            font-size: 1.2em;
            color: #28a745;
            font-weight: bold;
          }
          .routes-container {
            padding: 15px 20px;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }
          .route-badge {
            background-color: #e7f3ff;
            color: #007bff;
            padding: 6px 12px;
            border-radius: 16px;
            font-size: 0.95em;
            font-weight: 500;
            border: 1px solid #cce4ff;
          }
          .no-routes {
            color: #8a8d91;
            font-style: italic;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 0.85em;
            color: #8a8d91;
          }
        </style>
      </head>
      <body>
        <div class="report-container">
          ${editBanner}
          <div class="header">
            <h1>Route Report</h1>
          </div>
          
          <div class="meta-info">
            <div class="meta-item">
              <div class="label">Reporter</div>
              <div class="value">${driverName}</div>
            </div>
            <div class="meta-item">
              <div class="label">Date & Time</div>
              <div class="value">${dateStr}</div>
            </div>
          </div>

          ${vehicleCardsHtml}

          <div class="footer">
            Munandy Vehicle Management System
          </div>
        </div>
      </body>
    </html>
    `;
}

/**
 * Build and send the formatted Route Report to the WhatsApp group as an IMAGE.
 */
async function sendRouteReportToGroup(sock, sessionData) {
    const notifyJid = process.env.NOTIFY_GROUP_JID;
    if (!notifyJid) {
        console.warn('NOTIFY_GROUP_JID not set — skipping group notification.');
        return;
    }

    const htmlContent = buildRouteReportHTML(sessionData);

    try {
        console.log('Generating route report image...');
        const imageBuffer = await nodeHtmlToImage({
            html: htmlContent,
            quality: 100,
            type: 'jpeg'
        });

        console.log('Sending route report image to group...');
        await sock.sendMessage(notifyJid, { 
            image: imageBuffer,
            caption: `🗺️ Route Report submitted by ${sessionData.driverName}`
        });
        console.log('Route report image sent to group successfully.');
    } catch (err) {
        console.error('Failed to send route report image to group:', err);
        
        // Fallback to text if image fails
        const fallbackText = `🗺️ Route Report\nReporter: ${sessionData.driverName}\nDate: ${new Date().toLocaleString()}\n(Image generation failed)`;
        await sock.sendMessage(notifyJid, { text: fallbackText });
    }
}

module.exports = { sendRouteReportToGroup };
