import { useTranslation } from 'react-i18next'
import { canDisplayAsVerifiedMedia, getMediaDisclosureKey } from './learningMediaModel.js'

function EducationMediaCard({ item }) {
  const { t } = useTranslation(['education', 'common'])
  const verified = canDisplayAsVerifiedMedia(item)

  return (
    <article className="education-media-card">
      <div className="education-media-preview" aria-label={t('media.previewAria')}>
        <span aria-hidden="true">{verified ? '▶' : '▣'}</span>
        <strong>{verified ? t('media.videoAvailable') : t('media.videoPlaceholder')}</strong>
      </div>
      <div>
        <p className="eyebrow">{t(`media.category.${item.category}`, { defaultValue: item.category })}</p>
        <h3>{t(item.titleKey)}</h3>
        <p>{t(item.descriptionKey)}</p>
      </div>
      <dl className="education-media-meta">
        <div>
          <dt>{t('media.fields.length')}</dt>
          <dd>{t('media.lengthMissing')}</dd>
        </div>
        <div>
          <dt>{t('media.fields.source')}</dt>
          <dd>{t('media.sourcePlanned')}</dd>
        </div>
        <div>
          <dt>{t('media.fields.captions')}</dt>
          <dd>{item.captionsAvailable ? t('common:yes') : t('media.captionsPlanned')}</dd>
        </div>
        <div>
          <dt>{t('media.fields.transcript')}</dt>
          <dd>{item.transcriptAvailable ? t('common:yes') : t('media.transcriptPlanned')}</dd>
        </div>
        <div>
          <dt>{t('media.fields.age')}</dt>
          <dd>{t(`media.age.${item.ageRating}`, { defaultValue: item.ageRating })}</dd>
        </div>
      </dl>
      <p className="education-status-pill">{t(getMediaDisclosureKey(item))}</p>
    </article>
  )
}

export default EducationMediaCard
