const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const rooms = {};

const questions = [
    {
        question: "Which keyword is used to inherit a class in Java?",
        options: ["implements", "extends", "inherits", "super"],
        answer: 1
    },
    {
        question: "Which method is the entry point of a Java application?",
        options: [
            "start()",
            "run()",
            "main()",
            "execute()"
        ],
        answer: 2
    },
    {
        question: "Which data type stores true or false?",
        options: ["int", "char", "boolean", "String"],
        answer: 2
    },
    {
        question: "Which keyword creates an object in Java?",
        options: ["class", "new", "this", "void"],
        answer: 1
    },
    {
        question: "Which of these is not a primitive Java data type?",
        options: ["int", "double", "boolean", "String"],
        answer: 3
    },
    {
        question: "Which symbol ends a normal Java statement?",
        options: [":", ".", ";", ","],
        answer: 2
    },
    {
        question: "Which keyword is used to define a class in Java?",
        options: ["class", "object", "define", "struct"],
        answer: 0
    },
    {
        question: "Which loop executes its body at least once?",
        options: ["for", "while", "do-while", "enhanced for"],
        answer: 2
    },
    {
        question: "Which keyword is used to create a subclass?",
        options: ["extends", "import", "package", "static"],
        answer: 0
    },
    {
        question: "Which collection does not allow duplicate elements?",
        options: ["ArrayList", "LinkedList", "Set", "Array"],
        answer: 2
    }
];

function generateCode() {
    let code;

    do {
        code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms[code]);

    return code;
}

function getLeaderboard(room) {
    return Object.values(room.players)
        .map(player => ({
            id: player.id,
            name: player.name,
            score: player.score
        }))
        .sort((a, b) => b.score - a.score);
}

function sendLeaderboard(code) {
    const room = rooms[code];

    if (room) {
        io.to(code).emit(
            "leaderboard",
            getLeaderboard(room)
        );
    }
}

function publicQuestion(question) {
    return {
        question: question.question,
        options: question.options
    };
}

function endQuestion(code) {
    const room = rooms[code];

    if (!room || !room.active) return;

    clearInterval(room.timer);
    room.timer = null;

    const question = questions[room.questionIndex];

    io.to(code).emit("answerResult", {
        correctAnswer: question.answer,
        leaderboard: getLeaderboard(room)
    });

    sendLeaderboard(code);

    room.phase = "result";

    room.resultTimer = setTimeout(() => {
        room.resultTimer = null;

        if (!rooms[code] || !room.active) return;

        room.questionIndex++;

        if (room.questionIndex >= questions.length) {
            room.active = false;
            room.phase = "finished";

            io.to(code).emit("quizFinished", {
                leaderboard: getLeaderboard(room)
            });

            return;
        }

        startQuestion(code);
    }, 3000);
}

function startQuestion(code) {
    const room = rooms[code];

    if (!room || !room.active) return;

    clearInterval(room.timer);

    room.phase = "question";
    room.answered = new Set();

    const question = questions[room.questionIndex];
    let timeLeft = 15;

    io.to(code).emit("newQuestion", {
        question: publicQuestion(question),
        questionNumber: room.questionIndex + 1,
        totalQuestions: questions.length,
        timeLeft
    });

    room.timer = setInterval(() => {
        timeLeft--;

        io.to(code).emit("timer", timeLeft);

        if (timeLeft <= 0) {
            endQuestion(code);
        }
    }, 1000);
}

io.on("connection", socket => {

    console.log("Connected:", socket.id);

    // HOST CREATES A GAME
    socket.on("createGame", () => {
        const code = generateCode();

        rooms[code] = {
            host: socket.id,
            players: {},
            active: false,
            phase: "lobby",
            questionIndex: 0,
            answered: new Set(),
            timer: null,
            resultTimer: null
        };

        socket.join(code);

        socket.emit("gameCreated", code);

        console.log("Game created:", code);
    });

    // PLAYER JOINS A GAME
    socket.on("joinGame", ({ code, name }) => {
        code = String(code || "").trim();
        name = String(name || "").trim();

        const room = rooms[code];

        if (!room) {
            socket.emit("joinError", "Invalid game code.");
            return;
        }

        if (room.active || room.phase !== "lobby") {
            socket.emit("joinError", "This quiz has already started.");
            return;
        }

        if (!name || name.length > 20) {
            socket.emit(
                "joinError",
                "Enter a name between 1 and 20 characters."
            );
            return;
        }

        const alreadyJoined = Object.values(room.players)
            .some(player =>
                player.name.toLowerCase() === name.toLowerCase()
            );

        if (alreadyJoined) {
            socket.emit(
                "joinError",
                "That name is already taken in this game."
            );
            return;
        }

        room.players[socket.id] = {
            id: socket.id,
            name,
            score: 0
        };

        socket.join(code);

        socket.emit("joinedGame", {
            code,
            name
        });

        io.to(code).emit(
            "playerList",
            Object.values(room.players).map(player => player.name)
        );

        sendLeaderboard(code);
    });

    // HOST STARTS THE QUIZ
    socket.on("startQuiz", code => {
        const room = rooms[code];

        if (!room || room.host !== socket.id) return;

        if (room.active || room.phase !== "lobby") return;

        if (Object.keys(room.players).length === 0) {
            socket.emit(
                "hostMessage",
                "Wait for at least one player to join."
            );
            return;
        }

        room.active = true;
        room.questionIndex = 0;

        startQuestion(code);
    });

    // PLAYER SUBMITS AN ANSWER
    socket.on("submitAnswer", ({ code, answer }) => {
        const room = rooms[code];

        if (!room || !room.active) return;
        if (room.phase !== "question") return;
        if (room.answered.has(socket.id)) return;

        const player = room.players[socket.id];

        if (!player) return;

        if (
            !Number.isInteger(answer) ||
            answer < 0 ||
            answer >= questions[room.questionIndex].options.length
        ) {
            return;
        }

        room.answered.add(socket.id);

        const correct =
            answer === questions[room.questionIndex].answer;

        if (correct) {
            // Faster correct answers earn more points.
            const timeBonus = Math.max(
                0,
                Math.floor(playerTimeBonus(room))
            );

            player.score += 500 + timeBonus;
        }

        socket.emit("answerReceived", {
            correct
        });

        sendLeaderboard(code);

        // End early when all players have answered.
        if (room.answered.size >= Object.keys(room.players).length) {
            endQuestion(code);
        }
    });

    // HANDLE DISCONNECTIONS
    socket.on("disconnect", () => {
        console.log("Disconnected:", socket.id);

        for (const code of Object.keys(rooms)) {
            const room = rooms[code];

            if (room.host === socket.id) {
                clearInterval(room.timer);
                clearTimeout(room.resultTimer);

                io.to(code).emit(
                    "gameClosed",
                    "The host disconnected. This game has ended."
                );

                delete rooms[code];
                continue;
            }

            if (room.players[socket.id]) {
                delete room.players[socket.id];
                room.answered.delete(socket.id);

                io.to(code).emit(
                    "playerList",
                    Object.values(room.players).map(player => player.name)
                );

                sendLeaderboard(code);

                if (
                    room.active &&
                    room.phase === "question" &&
                    room.answered.size >= Object.keys(room.players).length
                ) {
                    endQuestion(code);
                }
            }
        }
    });
});

// Approximate speed bonus based on the remaining question time.
function playerTimeBonus(room) {
    if (!room.timer) return 0;

    return 0;
}

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Java Quiz server running at http://localhost:${PORT}`);
});