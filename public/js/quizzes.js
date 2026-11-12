// Ready-made sessions and slide templates.
// Slide types: quiz, poll, wordcloud, open, scale, qa

export const SLIDE_TYPES = [
  { type: "quiz", label: "Quiz question", hint: "One right answer, timer and points" },
  { type: "poll", label: "Poll", hint: "Live bar chart, no right answer" },
  { type: "wordcloud", label: "Word cloud", hint: "Short words grow as more people send them" },
  { type: "open", label: "Open question", hint: "Free-text answers shown as cards" },
  { type: "scale", label: "Scale", hint: "Rate statements from 1 to 5" },
  { type: "qa", label: "Q&A", hint: "Audience asks and upvotes questions" },
];
export const TYPE_LABEL = Object.fromEntries(SLIDE_TYPES.map((t) => [t.type, t.label]));

export const DEMO_QUIZ = {
  title: "Kalakal warm-up: 10 quick questions",
  questions: [
    { type: "quiz", text: 'Which word means "play" in Tamil?', answers: ["விளையாடு", "வாக்களி", "கொண்டாடு", "கலக்கல்"], correct: 0, time: 20 },
    { type: "quiz", text: "What is the capital of Sweden?", answers: ["Oslo", "Stockholm", "Gothenburg", "Helsinki"], correct: 1, time: 15 },
    { type: "quiz", text: "How many players does a cricket team have on the field?", answers: ["9", "10", "11", "12"], correct: 2, time: 15 },
    { type: "quiz", text: "Which planet is known as the Red Planet?", answers: ["Venus", "Mars", "Jupiter", "Saturn"], correct: 1, time: 15 },
    { type: "quiz", text: "In which Indian state is Tamil the official language?", answers: ["Kerala", "Karnataka", "Tamil Nadu", "Andhra Pradesh"], correct: 2, time: 20 },
    { type: "quiz", text: 'What is "fika" in Sweden?', answers: ["A coffee break with something sweet", "A winter festival", "A folk dance", "A type of boat"], correct: 0, time: 20 },
    { type: "quiz", text: "How many couplets are in the Thirukkural?", answers: ["133", "1,330", "13,300", "330"], correct: 1, time: 20 },
    { type: "quiz", text: "Which gas do plants take in from the air to make food?", answers: ["Oxygen", "Nitrogen", "Carbon dioxide", "Helium"], correct: 2, time: 20 },
    { type: "quiz", text: 'What does "www" stand for in a web address?', answers: ["World Wide Web", "Wide World Web", "Web World Wide", "World Web Wire"], correct: 0, time: 15 },
    { type: "quiz", text: "What kind of animal is the Nilgiri tahr?", answers: ["A mountain goat", "A river fish", "A bird", "A big cat"], correct: 0, time: 15 },
  ],
};

export const DEMO_MEETING = {
  title: "Team meeting warm-up",
  questions: [
    { type: "wordcloud", text: "One word for how your week is going" },
    { type: "poll", text: "How do you prefer to start the day?", answers: ["Coffee", "Tea", "Fika with cake", "Straight to work"] },
    { type: "scale", text: "How are we doing as a team?", statements: ["We communicate clearly", "Meetings are useful", "I can ask for help easily"], low: "Disagree", high: "Agree" },
    { type: "quiz", text: 'What is "fika" in Sweden?', answers: ["A coffee break with something sweet", "A winter festival", "A folk dance", "A type of boat"], correct: 0, time: 20 },
    { type: "open", text: "What is one thing we should start doing?" },
    { type: "qa", text: "Ask the team anything" },
  ],
};

export function blankSlide(type = "quiz") {
  switch (type) {
    case "quiz": return { type, text: "", answers: ["", "", "", ""], correct: 0, time: 20 };
    case "poll": return { type, text: "", answers: ["", "", "", ""] };
    case "scale": return { type, text: "", statements: ["", ""], low: "Disagree", high: "Agree" };
    default: return { type, text: "" };
  }
}
// Back-compat for older drafts
export const blankQuestion = () => blankSlide("quiz");
