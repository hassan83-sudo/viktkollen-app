import { useEffect, useMemo, useState } from 'react'

function Quiz({
  onAnswerResult,
  onQuestionChange,
  onSubjectChange,
  questionBank,
  selectedSubject,
  subjects,
}) {
  const questions = questionBank[selectedSubject]
  const [questionIndex, setQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState('')
  const [feedback, setFeedback] = useState('')
  const [score, setScore] = useState(0)
  const currentQuestion = questions[questionIndex]
  const isFinished = questionIndex >= questions.length
  const progress = useMemo(
    () => Math.round(((questionIndex + (isFinished ? 0 : 1)) / questions.length) * 100),
    [isFinished, questionIndex, questions.length],
  )

  useEffect(() => {
    onQuestionChange(isFinished ? null : currentQuestion)
  }, [currentQuestion, isFinished, onQuestionChange])

  function chooseAnswer(option) {
    if (selectedAnswer || isFinished) {
      return
    }

    setSelectedAnswer(option)

    const isCorrectAnswer = option === currentQuestion.answer

    onAnswerResult({
      correctAnswer: currentQuestion.answer,
      isCorrect: isCorrectAnswer,
      question: currentQuestion.question,
      selectedAnswer: option,
      subject: selectedSubject,
    })

    if (isCorrectAnswer) {
      setScore((currentScore) => currentScore + 1)
      setFeedback('Rätt! +100 XP')
    } else {
      setFeedback(`Fel. Rätt svar är ${currentQuestion.answer}.`)
    }

    window.setTimeout(() => {
      setSelectedAnswer('')
      setFeedback('')
      setQuestionIndex((currentIndex) => currentIndex + 1)
    }, 1200)
  }

  function restartQuiz() {
    setQuestionIndex(0)
    setSelectedAnswer('')
    setFeedback('')
    setScore(0)
  }

  return (
    <section className="panel quiz-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Quizbank</p>
          <h2>{selectedSubject}</h2>
        </div>
        <span className="score-pill">{score} rätt</span>
      </div>

      <div className="subject-tabs" aria-label="Välj ämne">
        {subjects.map((subject) => (
          <button
            className={subject === selectedSubject ? 'active' : ''}
            type="button"
            key={subject}
            onClick={() => onSubjectChange(subject)}
          >
            {subject}
          </button>
        ))}
      </div>

      {isFinished ? (
        <div className="complete-card">
          <strong>{score}/{questions.length} rätt</strong>
          <p>Grymt jobbat i {selectedSubject}. Kör igen och samla mer XP.</p>
          <button type="button" onClick={restartQuiz}>
            Starta om quiz
          </button>
        </div>
      ) : (
        <>
          <div className="quiz-progress" aria-label="Quizprogress">
            <span style={{ width: `${progress}%` }} />
          </div>

          <h3>Fråga {questionIndex + 1}: {currentQuestion.question}</h3>
          <div className="answer-grid">
            {currentQuestion.options.map((option) => {
              const isCorrect = selectedAnswer && option === currentQuestion.answer
              const isWrong = selectedAnswer === option && option !== currentQuestion.answer

              return (
                <button
                  className={`answer-button ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''}`}
                  type="button"
                  key={option}
                  onClick={() => chooseAnswer(option)}
                >
                  {option}
                </button>
              )
            })}
          </div>

          {feedback && <p className="feedback">{feedback}</p>}
        </>
      )}
    </section>
  )
}

export default Quiz
