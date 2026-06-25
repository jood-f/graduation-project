How to run the website locally

1. Open the project folder in VS Code.
2. Open one terminal and go to the backend folder:
   cd backend
3. If you have not set up the Python environment yet, create and activate it:
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
4. Install the backend packages:(if not installed)
   pip install -r requirements.txt
5. Start the backend server:
   python -m uvicorn app.main:app --reload

6. Open a second terminal and go to the frontend folder:
   cd frontend
7. Install the frontend packages:(if not installed)
   npm install
8. Start the website:
   npm run dev
9. Open the link shown in the terminal, for example http://localhost:5173

If something does not load, make sure both the backend and frontend terminals are still running.