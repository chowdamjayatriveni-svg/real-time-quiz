const socket = io();

const homeScreen = document.getElementById("homeScreen");
const lobbyScreen = document.getElementById("lobbyScreen");
const quizScreen = document.getElementById("quizScreen");
const resultScreen = document.getElementById("resultScreen");

const createGameBtn = document.getElementById("createGameBtn");
const joinGameBtn = document.getElementById("joinGameBtn");
const startQuizBtn = document.getElementById("startQuizBtn");

const gameCodeInput = document.getElementById("gameCodeInput");
const playerNameInput = document.getElementById("playerNameInput");

const homeMessage = document.getElementById("homeMessage");
const lobbyMessage = document.getElementById("lobbyMessage");
const answerMessage = document.getElementById("answerMessage");

const displayCode = document.getElementById("displayCode");
const roleMessage = document.getElementById("roleMessage");
const playerList = document.getElementById("playerList");

const questionNumber = document.getElementById("questionNumber");
const questionText = document.getElementById("questionText");
const optionsContainer = document.getElementById("optionsContainer");

const timerDisplay = document.getElementById("timer");
const timerProgress = document.getElementById("timerProgress");

const resultTitle = document.getElementById("resultTitle");
const winnerMessage = document.getElementById("winnerMessage");
const leaderboardList = document.getElementById("leaderboardList");

let currentCode = "";
let playerName = "";
let isHost = false;
let hasAnswered = false;
let currentTime = 15;

function showScreen(screen) {
    homeScreen.classList.add("hidden");
    lobbyScreen.classList.add("hidden");
    quizScreen.classList.add("hidden");
    resultScreen.classList.add("hidden");

    screen.classList.remove("hidden");
}

function showMessage(element, message) {
    element.textContent = message;
}

function renderPlayerList(names) {
    playerList.replaceChildren();

    names.forEach(name => {
        const li = document.createElement("li");
        li.textContent = name;
        playerList.appendChild(li);
    });

    if (names.length === 0) {
        const li = document.createElement("li");
        li.textContent = "Waiting for players...";
        playerList.appendChild(li);
    }
}

function renderLeaderboard(players, listElement) {
    listElement.replaceChildren();

    players.forEach((player, index) => {
        const li = document.createElement("li");

        li.textContent =
            `${index + 1}. ${player.name} — ${player.score} points`;

        listElement.appendChild(li);
    });

    if (players.length === 0) {
        const li = document.createElement("li");
        li.textContent = "No scores yet.";
        listElement.appendChild(li);
    }
}

// HOST CREATES A GAME
createGameBtn.addEventListener("click", () => {
    createGameBtn.disabled = true;
    showMessage(homeMessage, "Creating your Java quiz...");

    socket.emit("createGame");
});

// SERVER RETURNS GAME CODE
socket.on("gameCreated", code => {
    currentCode = code;
    isHost = true;

    displayCode.textContent = code;
    roleMessage.textContent =
        "You are the host. Share this code with your friends.";

    startQuizBtn.classList.remove("hidden");

    renderPlayerList([]);

    showScreen(lobbyScreen);
});

// PLAYER JOINS A GAME
joinGameBtn.addEventListener("click", () => {
    const code = gameCodeInput.value.trim();
    const name = playerNameInput.value.trim();

    if (!/^\d{6}$/.test(code)) {
        showMessage(homeMessage, "Enter a valid 6-digit game code.");
        return;
    }

    if (!name) {
        showMessage(homeMessage, "Enter your name.");
        return;
    }

    currentCode = code;
    playerName = name;

    showMessage(homeMessage, "Joining quiz...");

    socket.emit("joinGame", {
        code,
        name
    });
});

// PLAYER JOINED SUCCESSFULLY
socket.on("joinedGame", data => {
    currentCode = data.code;
    playerName = data.name;
    isHost = false;

    displayCode.textContent = data.code;

    roleMessage.textContent =
        `Welcome, ${data.name}! Wait for the host to start the quiz.`;

    startQuizBtn.classList.add("hidden");

    showScreen(lobbyScreen);
});

// JOIN ERROR
socket.on("joinError", message => {
    showMessage(homeMessage, message);
});

// PLAYER LIST UPDATES
socket.on("playerList", names => {
    renderPlayerList(names);
});

// HOST STARTS THE QUIZ
startQuizBtn.addEventListener("click", () => {
    startQuizBtn.disabled = true;
    showMessage(lobbyMessage, "Starting quiz...");

    socket.emit("startQuiz", currentCode);
});

// HOST MESSAGES
socket.on("hostMessage", message => {
    showMessage(lobbyMessage, message);
    startQuizBtn.disabled = false;
});

// DISPLAY A NEW QUESTION
socket.on("newQuestion", data => {
    hasAnswered = false;

    showScreen(quizScreen);

    questionNumber.textContent =
        `Question ${data.questionNumber} of ${data.totalQuestions}`;

    questionText.textContent = data.question.question;

    optionsContainer.replaceChildren();

    answerMessage.textContent = "";

    currentTime = data.timeLeft;
    updateTimer(currentTime);

    data.question.options.forEach((option, index) => {
        const button = document.createElement("button");

        button.className = "optionButton";
        button.textContent =
            `${String.fromCharCode(65 + index)}. ${option}`;

        button.addEventListener("click", () => {
            submitAnswer(index, button);
        });

        optionsContainer.appendChild(button);
    });
});

// PLAYER SUBMITS AN ANSWER
function submitAnswer(answer, selectedButton) {
    if (hasAnswered) return;

    hasAnswered = true;

    const buttons =
        optionsContainer.querySelectorAll("button");

    buttons.forEach(button => {
        button.disabled = true;
    });

    selectedButton.classList.add("selected");

    showMessage(answerMessage, "Answer submitted! Waiting for results...");

    socket.emit("submitAnswer", {
        code: currentCode,
        answer
    });
}

// SERVER CONFIRMS ANSWER RECEIVED
socket.on("answerReceived", data => {
    if (data.correct) {
        showMessage(answerMessage, "Answer submitted successfully!");
    } else {
        showMessage(answerMessage, "Answer submitted. Wait for the result!");
    }
});

// TIMER UPDATES
socket.on("timer", timeLeft => {
    currentTime = timeLeft;
    updateTimer(timeLeft);
});

function updateTimer(timeLeft) {
    timerDisplay.textContent = timeLeft;

    timerProgress.style.width =
        `${Math.max(0, (timeLeft / 15) * 100)}%`;

    if (timeLeft <= 5) {
        timerProgress.style.background = "#d93025";
    } else {
        timerProgress.style.background = "#16a765";
    }
}

// SHOW CORRECT ANSWER
socket.on("answerResult", data => {
    const buttons =
        optionsContainer.querySelectorAll("button");

    buttons.forEach((button, index) => {
        button.disabled = true;

        if (index === data.correctAnswer) {
            button.textContent = "✓ " + button.textContent;
        }
    });

    if (!hasAnswered) {
        showMessage(answerMessage, "Time is up!");
    } else {
        showMessage(answerMessage, "Correct answer revealed!");
    }

    renderLeaderboard(
        data.leaderboard,
        leaderboardList
    );
});

// LIVE LEADERBOARD
socket.on("leaderboard", players => {
    renderLeaderboard(players, leaderboardList);
});

// QUIZ FINISHED
socket.on("quizFinished", data => {
    showScreen(resultScreen);

    renderLeaderboard(
        data.leaderboard,
        leaderboardList
    );

    if (data.leaderboard.length === 0) {
        winnerMessage.textContent = "No winner this time.";
        return;
    }

    const highestScore = data.leaderboard[0].score;

    const winners = data.leaderboard.filter(
        player => player.score === highestScore
    );

    if (winners.length === 1) {
        winnerMessage.textContent =
            `🏆 Winner: ${winners[0].name}!`;
    } else {
        winnerMessage.textContent =
            `🏆 It's a tie between ${winners.map(p => p.name).join(", ")}!`;
    }
});

// GAME CLOSED
socket.on("gameClosed", message => {
    showScreen(homeScreen);

    showMessage(homeMessage, message);

    createGameBtn.disabled = false;
});

// COPY GAME CODE
document.getElementById("copyCodeBtn")
    .addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(currentCode);

            showMessage(
                lobbyMessage,
                "Game code copied!"
            );
        } catch (error) {
            showMessage(
                lobbyMessage,
                `Share this code: ${currentCode}`
            );
        }
    });

// RETURN TO HOME
document.getElementById("playAgainBtn")
    .addEventListener("click", () => {
        window.location.reload();
    });

// CONNECTION STATUS
socket.on("connect", () => {
    console.log("Connected to quiz server.");
});

socket.on("disconnect", () => {
    console.log("Disconnected from quiz server.");
});