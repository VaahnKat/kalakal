// Ready-made quizzes. Each question: text, 2-4 answers, index of the correct one, seconds.
export const DEMO_QUIZ = {
  title: "Kalakal warm-up: 10 quick questions",
  questions: [
    { text: 'Which word means "play" in Tamil?', answers: ["விளையாடு", "வாக்களி", "கொண்டாடு", "கலக்கல்"], correct: 0, time: 20 },
    { text: "What is the capital of Sweden?", answers: ["Oslo", "Stockholm", "Gothenburg", "Helsinki"], correct: 1, time: 15 },
    { text: "How many players does a cricket team have on the field?", answers: ["9", "10", "11", "12"], correct: 2, time: 15 },
    { text: "Which planet is known as the Red Planet?", answers: ["Venus", "Mars", "Jupiter", "Saturn"], correct: 1, time: 15 },
    { text: "In which Indian state is Tamil the official language?", answers: ["Kerala", "Karnataka", "Tamil Nadu", "Andhra Pradesh"], correct: 2, time: 20 },
    { text: 'What is "fika" in Sweden?', answers: ["A coffee break with something sweet", "A winter festival", "A folk dance", "A type of boat"], correct: 0, time: 20 },
    { text: "How many couplets are in the Thirukkural?", answers: ["133", "1,330", "13,300", "330"], correct: 1, time: 20 },
    { text: "Which gas do plants take in from the air to make food?", answers: ["Oxygen", "Nitrogen", "Carbon dioxide", "Helium"], correct: 2, time: 20 },
    { text: 'What does "www" stand for in a web address?', answers: ["World Wide Web", "Wide World Web", "Web World Wide", "World Web Wire"], correct: 0, time: 15 },
    { text: "What kind of animal is the Nilgiri tahr?", answers: ["A mountain goat", "A river fish", "A bird", "A big cat"], correct: 0, time: 15 },
  ],
};

export function blankQuestion() {
  return { text: "", answers: ["", "", "", ""], correct: 0, time: 20 };
}
