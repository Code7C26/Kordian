import React from 'react'
import { UploadCloud } from 'lucide-react'

export default function CsvUploader({ onUploaded }) {
  const handleFile = async (file) => {
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const response = await fetch('http://localhost:3000/upload-csv', { method: 'POST', body: formData })
      const data = await response.json()
      if (data.success) {
        onUploaded?.(null, 'CSV importado correctamente')
      } else {
        onUploaded?.(new Error('Error importando CSV'))
      }
    } catch (err) {
      console.error(err)
      alert('Error subiendo archivo')
    }
  }

  return (
    <div className="bg-white dark:bg-stone-800 rounded-2xl p-6 shadow-sm">
      <h3 className="text-lg font-bold mb-2">Importar CSV</h3>
      <p className="text-sm text-stone-500 mb-3">Carga un archivo CSV para importar productos y ofertas.</p>
      <label className="flex items-center gap-3 cursor-pointer">
        <div className="px-4 py-2 bg-sky-600 text-white rounded-lg flex items-center gap-2"><UploadCloud size={16}/> Seleccionar archivo</div>
        <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      </label>
    </div>
  )
}
