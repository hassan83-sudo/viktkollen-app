import ProductList from './ProductList.jsx'

function BarcodeScanner({
  barcodeInput,
  barcodeScannerActive,
  barcodeStatus,
  barcodeVideoRef,
  onBarcodeInputChange,
  onStartBarcodeScanner,
  onStopBarcodeScanner,
  onSubmitManualBarcode,
  scannedProducts,
}) {
  const noProductFound =
    barcodeStatus.toLocaleLowerCase('sv-SE').includes('hittades inte') &&
    scannedProducts.length === 0

  return (
    <article className="panel scanner-panel" id="streckkod">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Streckkod</p>
          <h2>Skanna produkt</h2>
        </div>
      </div>

      <p className="settings-note">
        Skanna en streckkod eller skriv in den manuellt för att hitta produkten.
      </p>

      <div className="scanner-tool">
        <video
          className="barcode-video"
          ref={barcodeVideoRef}
          muted
          playsInline
        />
        <div className="scanner-actions">
          <button type="button" onClick={onStartBarcodeScanner}>
            Starta kamera
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={onStopBarcodeScanner}
            disabled={!barcodeScannerActive}
          >
            Stoppa
          </button>
        </div>
        <p className="settings-note">
          Kameran används bara medan skanningen är aktiv.
        </p>
        {barcodeStatus && <p className="analysis-status">{barcodeStatus}</p>}
        {noProductFound && (
          <p className="analysis-status">
            Produkten hittades inte. Kontrollera streckkoden eller prova en
            annan produkt.
          </p>
        )}
        <form className="inline-form" onSubmit={onSubmitManualBarcode}>
          <input
            type="text"
            inputMode="numeric"
            placeholder="Skriv streckkod manuellt"
            value={barcodeInput}
            onChange={(event) => onBarcodeInputChange(event.target.value)}
          />
          <button type="submit">Spara</button>
        </form>
      </div>

      {scannedProducts.length > 0 && (
        <ProductList products={scannedProducts} />
      )}
    </article>
  )
}

export default BarcodeScanner
