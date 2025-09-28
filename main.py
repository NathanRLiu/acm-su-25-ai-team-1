from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import joblib
import numpy as np




app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Or specify ["http://localhost:3000"] for more security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the model and scaler
model = joblib.load("model.pkl")
scaler = joblib.load("scaler.pkl")


class PredictRequest(BaseModel):
    data: list


@app.post("/predict")
def predict(request: PredictRequest):
    # Convert input to numpy array
    input_data = np.array(request.data).reshape(1, -1)
    # Normalize input using the saved scaler
    input_scaled = scaler.transform(input_data)
    # Make prediction
    prediction = model.predict(input_scaled)
    return {"prediction": prediction.tolist()}
