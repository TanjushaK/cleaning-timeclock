export default function AppFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="appFooter">
      Чисто. Чётко. По времени. <span className="appFooterYear">© {year}</span>
    </footer>
  )
}
