import ProfileCard from './ProfileCard.jsx'
import AiEyeCard from './AiEyeCard.jsx'
import MemoryTrainingCard from './MemoryTrainingCard.jsx'

function ReadyQuickActions({ onOpenProfile, onOpenEye, onOpenMemory }) {
  return (
    <div className="ready-quick-actions">
      <ProfileCard onOpen={onOpenProfile} />
      <AiEyeCard onOpen={onOpenEye} />
      <MemoryTrainingCard onOpen={onOpenMemory} />
    </div>
  )
}

export default ReadyQuickActions
