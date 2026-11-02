OutcomeChad Sports ⚽

OutcomeChad Sports is a mobile-friendly football platform for following live scores, fixtures, match results, competitions, and match details.

🌐 Live Website: https://outcomechadsports.vercel.app

⸻

Features

* ⚽ Live football scores
* 📅 Football fixtures by date
* 🏆 Competition and league filters
* 🔎 Search teams and competitions
* 📊 Match centre with match information
* 📱 Responsive design for mobile and desktop
* 🔄 Automatic score refresh
* 🖼️ Team logos and competition information
* 📢 Google AdSense advertising support

Technology

OutcomeChad Sports uses:

* HTML
* CSS
* JavaScript
* Football API integration
* Vercel for hosting and deployment
* Google AdSense for advertising

API Routes

The frontend communicates with the following backend routes:

Route	Purpose
/api/football/live	Retrieves live football matches and scores
/api/football/fixtures	Retrieves football fixtures
/api/teams	Retrieves team information and logos

The frontend uses these routes to display football data.

Environment Variables

The football API key should be configured in the Vercel project environment settings.

Example:

ISPORTS_API_KEY=your_api_key

Do not place API keys directly inside index.html or commit them to GitHub.

The backend API routes should read the key from the server environment.

Advertising

OutcomeChad Sports supports Google AdSense.

The AdSense script is included in the website’s HTML. Advertising is managed through Google AdSense.

Before ads can appear, the website must meet Google’s requirements and be approved for AdSense.

Deployment

OutcomeChad Sports is hosted on Vercel.

To deploy updates:

1. Make changes to the project files.
2. Commit and push the changes to GitHub.
3. Ensure the Vercel project is connected to the correct repository.
4. Vercel will build and deploy the updated website.
5. Open the live website to verify the deployment.

Project Structure

OutcomeChad-Sports/
├── api/
│   ├── football/
│   │   ├── live.js
│   │   └── fixtures.js
│   └── teams.js
├── index.html
├── favicon.png
├── README.md
└── package.json

The project structure may vary depending on the API routes and deployment configuration.

Project Goal

OutcomeChad Sports aims to provide football fans with a simple, fast, and accessible way to follow matches, check scores, explore fixtures, and view match information.

Disclaimer

OutcomeChad Sports is an independent sports platform. Football data is provided through third-party APIs and may be subject to availability, delays, or provider limitations.

Team names, competition names, logos, and other match information may belong to their respective owners.