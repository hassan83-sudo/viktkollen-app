function QuickActions({ onStarterPrompt, starterPrompts }) {
  return (
    <div className="starter-prompts" role="group" aria-label="Förslag på frågor">
      {starterPrompts.map((prompt) => (
        <button
          className="prompt-chip"
          type="button"
          key={prompt}
          onClick={() => onStarterPrompt(prompt)}
        >
          {prompt}
        </button>
      ))}
    </div>
  )
}

export default QuickActions
