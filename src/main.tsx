import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./app.css";
import { initDatabase } from "./lib/database";

// Initialize the SQLite database before rendering the app.
initDatabase().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
}).catch((err) => {
  console.error("Failed to initialize database:", err);
  // Show a critical error UI if the database cannot be initialized
  createRoot(document.getElementById("root")!).render(
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-none border border-black shadow-xl max-w-md w-full text-center">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">System Error</h1>
        <p className="text-gray-600 mb-6">
          Failed to initialize the database. This may be due to a browser restriction or a corrupted local file.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-none border border-black transition-colors"
        >
          Restart Application
        </button>
      </div>
    </div>
  );
});
