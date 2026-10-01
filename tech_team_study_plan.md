# Quant ML Trading Challenge: Tech Team Study Plan

This document outlines the specific study goals and resources for the 5-person technical organizing team. 

---

## 📚 General Knowledge (Required for ALL 5 Members)
Even if someone is only working on the website frontend, they must understand the core quant concepts of the game they are building so everyone speaks the same language.

**Core Quant Concepts for this Event:**
1. **Quant Trading Basics:** Using data, math, and code to trade, rather than intuition or human emotion. 
2. **Long vs. Short:** Going Long (+1.0) means buying an asset to profit from an upward move. Going Short (-1.0) means borrowing and selling an asset to profit from a downward move.
3. **Alpha ($\alpha$):** The ultimate goal of Round 3. It represents a strategy's "edge" or pure skill over the market, measured after accounting for risk.
4. **Overfitting & Lookahead Bias:** The biggest dangers in quant ML. Overfitting is memorizing the practice data. Lookahead Bias is accidentally using future data to predict the future (which gives a fake 100% score). Our platform strictly prevents this.
5. **Backtesting & Transaction Costs:** Simulating a strategy on past data (this is what our scoring engine does). Every trade incurs a fee; if a model changes its mind too fast (high turnover), transaction costs will eat all the profits.
6. **Regime Shifts (The Flash Crash):** Markets suddenly changing from calm to chaotic. Our event includes a "Flash Crash" to test if the teams' models can survive a sudden market shock.
7. **Chronological Splitting:** You can *never* shuffle financial time series data randomly for Machine Learning. It must be sliced strictly chronologically (Past $\rightarrow$ Future).
8. **Git & GitHub:** Basic collaboration workflow so the 5 of you can share code without overwriting each other.

**Verified Resources:**
*   **Video Search:** Search YouTube for "StatQuest Bias Variance" (The absolute best, most highly reviewed video on Overfitting).
*   **Video Search:** Search YouTube for "Investopedia Short Selling Explained".
*   **Article:** [Investopedia: Quantitative Trading](https://www.investopedia.com/articles/investing/041114/simple-overview-quantitative-analysis.asp)
*   **Interactive Tutorial:** [Learn Git Branching](https://learngitbranching.js.org/) (Industry standard for learning Git).

---

## 👨‍💻 Member 1: The Quant Data Engineer
**Goal:** Generate 5-6 realistic synthetic stocks and split them into chronological rolling windows for 40 teams, ensuring zero lookahead bias.

**Specific Topics to Study:**
1. **Geometric Brownian Motion (GBM):** The mathematical formula used to generate fake stock prices that look real (using Drift and Volatility).
2. **Regime Shifts / The Flash Crash:** How to mathematically simulate a sudden market crash (increasing volatility suddenly, making drift strongly negative).
3. **Chronological Splitting:** How to slice data using `pandas` without accidentally mixing future data into the past.

**Verified Resources:**
*   **Video Search:** Search YouTube for "Simulating Stock Prices in Python using GBM".
*   **Article:** [QuantStart: Geometric Brownian Motion](https://www.quantstart.com/articles/Geometric-Brownian-Motion/) (Top tier quant blog).
*   **Documentation:** [Pandas Time Series](https://pandas.pydata.org/pandas-docs/stable/user_guide/timeseries.html) (Official Docs).

---

## 🧮 Member 2: The Quant Scoring Engineer
**Goal:** Write the Python logic that grades the participants. This includes standard ML metrics and a financial backtesting engine.

**Specific Topics to Study:**
1. **Classification Metrics:** Why we use **Balanced Accuracy** and **Matthews Correlation Coefficient (MCC)** instead of standard accuracy.
2. **Portfolio Backtesting:** How to calculate a portfolio's changing value over time based on a team's $+1$ or $-1$ signals.
3. **Risk Metrics:** How to calculate the **Sharpe Ratio** (average return / standard deviation of returns) and **Maximum Drawdown**.

**Verified Resources:**
*   **Video Search:** Search YouTube for "Calculating Sharpe Ratio in Python" by highly viewed channels like *Part Time Larry*.
*   **Documentation:** [Scikit-Learn: Classification Metrics](https://scikit-learn.org/stable/modules/model_evaluation.html#classification-metrics) (Official Docs).
*   **Article:** [Investopedia: Sharpe Ratio](https://www.investopedia.com/terms/s/sharperatio.asp)

---

## 🎨 Member 3: The Frontend Developer
**Goal:** Build a beautiful, intuitive website where participants can log in, download their assigned CSVs, upload their prediction CSVs, and view a live countdown timer and leaderboard.

**Specific Topics to Study:**
1. **React / Next.js:** The standard frameworks for building fast, modern dashboards.
2. **State Management & Timers:** How to build a live countdown timer that stays synced across all participant screens.
3. **Forms & File Uploads:** How to build a robust file upload button that sends a CSV to the backend API.

**Verified Resources:**
*   **Video Search:** Search YouTube for "Next.js Crash Course" by *CodeWithAntonio* or *Traversy Media* (These are the most highly reviewed and popular web dev tutorials).
*   **Documentation:** [Tailwind CSS Components](https://tailwindui.com/) (Industry Standard).

---

## ⚙️ Member 4: The Backend API & Database Engineer
**Goal:** Build the server that acts as the bridge between the Frontend (Member 3) and the Scoring Scripts (Member 2). Securely manage the hidden answers.

**Specific Topics to Study:**
1. **FastAPI (Python):** The best framework for catching file uploads and running Python scoring scripts immediately.
2. **Data Validation (Pydantic / Pandas):** How to check if an uploaded CSV has exactly the right columns, right number of rows, and no missing data.
3. **Authentication:** How to securely log teams in so Team A cannot upload a file on behalf of Team B.

**Verified Resources:**
*   **Video Search:** Search YouTube for "FastAPI Crash Course" by *FreeCodeCamp* (The most trusted coding channel on YouTube).
*   **Video Search:** Search YouTube for "Firebase Authentication Tutorial" by *Fireship* (Highly popular, fast-paced dev tutorials).
*   **Documentation:** [FastAPI Official Docs](https://fastapi.tiangolo.com/) (Known as some of the best documentation in the software industry).

---

## 🧠 The Head (You): Lead Quant Architect & Reviewer
**Goal:** Ensure the math is correct, the data is safe, and the systems integrate perfectly. You are the final Quality Assurance (QA).

**Specific Topics to Study:**
1. **Time-Series Machine Learning:** You must understand how ML models are actually trained so you can act as "Team Zero" and test the data Member 1 generates. 
2. **Code Review Best Practices:** How to read Member 2's Python code and mathematically verify that their Sharpe Ratio logic is flawless.

**Verified Resources:**
*   **Video Search:** Search YouTube for "Machine Learning for Time Series Data".
*   **Article:** [Advances in Financial Machine Learning](https://www.quantstart.com/articles/Advances-in-Financial-Machine-Learning-by-Marcos-Lopez-de-Prado/) (A summary of the most famous book in modern quantitative finance).
