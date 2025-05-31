"use client";
// pages/index.tsx
import { useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

interface PeajeRow {
  Operación: string;
  Fecha: string;
  Estación: string;
  Matrícula: string;
  Categoría: string;
  "Tipo lectura": string;
  Monto: string;
  Saldo: string;
  Cuenta: string;
  Observación: string;
  [key: string]: string;
}

interface ArchivoProcesado {
  matricula: string;
  rango: string;
  datos: PeajeRow[];
}

function limpiarNombreHoja(nombre: string): string {
  return nombre.replace(/[\/\\:*?\[\]]/g, "_").slice(0, 31);
}

function acortarAnios(fechaTexto: string): string {
  return fechaTexto.replace(
    /(\d{2}\/\d{2}\/)(\d{4})/g,
    (_, d, y) => `${d}${y.slice(2)}`
  );
}

function formatFecha(valor: string): string {
  if (typeof valor === "number") {
    return XLSX.SSF.format("dd/mm/yyyy hh:mm:ss", valor);
  }
  return valor;
}

function formatMonto(valor: string): string {
  if (typeof valor === "number") {
    return (valor / 100).toFixed(2);
  }
  if (typeof valor === "string" && /^-?\d+(,\d+)?$/.test(valor)) {
    return valor;
  }
  return valor;
}

export default function Home() {
  const [resumen, setResumen] = useState<Record<string, number>>({});
  const [fuentes, setFuentes] = useState<Record<string, string[]>>({});
  const [archivos, setArchivos] = useState<ArchivoProcesado[]>([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const allData: PeajeRow[] = [];
    const nuevasFuentes: Record<string, string[]> = { ...fuentes };
    const nuevosArchivos: ArchivoProcesado[] = [...archivos];

    for (const file of Array.from(files)) {
      const { data, header } = await readFile(file);
      if (data.length === 0) continue;
      allData.push(...data);
      const matriculasUnicas = Array.from(
        new Set(data.map((d) => d.Matrícula).filter(Boolean))
      );
      for (const matricula of matriculasUnicas) {
        if (!nuevasFuentes[matricula]) nuevasFuentes[matricula] = [];
        if (!nuevasFuentes[matricula].includes(header)) {
          nuevasFuentes[matricula].push(header);
        }
        const datosFiltrados = data.filter((d) => d.Matrícula === matricula);
        nuevosArchivos.push({
          matricula,
          rango: header,
          datos: datosFiltrados,
        });
      }
    }

    const nuevoResumen: Record<string, number> = { ...resumen };
    allData.forEach((row) => {
      // const operacion = row.Operación;
      const matricula = row.Matrícula;
      if (matricula) {
        nuevoResumen[matricula] = (nuevoResumen[matricula] || 0) + 1;
      }
    });

    setResumen(nuevoResumen);
    setFuentes(nuevasFuentes);
    setArchivos(nuevosArchivos);
  };

  const readFile = (
    file: File
  ): Promise<{ data: PeajeRow[]; header: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const binaryStr = event.target?.result;
        const workbook = XLSX.read(binaryStr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const headerRange = XLSX.utils.encode_range({
          s: { c: 0, r: 0 },
          e: { c: 9, r: 0 },
        });
        const headerRow = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          range: headerRange,
        });
        const headerText = (headerRow?.[0] as string[])?.join(" ").trim() || "";

        const data: PeajeRow[] = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
          range: 2,
        });

        resolve({ data, header: headerText });
      };
      reader.readAsBinaryString(file);
    });
  };

  const exportToExcel = () => {
    const rows = Object.entries(resumen).map(([matricula, cantidad]) => ({
      Matrícula: matricula,
      Peajes: cantidad,
      Fuente: (fuentes[matricula] || []).join(" | "),
    }));

    const workbook = XLSX.utils.book_new();
    const resumenSheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, resumenSheet, "Resumen");

    const hojasCreadas = new Set<string>();

    archivos.forEach(({ matricula, rango, datos }) => {
      const rangoSinMovimientos = rango
        .replace(/Movimientos\s*[-–]\s*/i, "")
        .trim();
      const rangoCorto = acortarAnios(rangoSinMovimientos);
      let nombreHoja = limpiarNombreHoja(`${matricula} - ${rangoCorto}`);
      let intento = 1;
      while (hojasCreadas.has(nombreHoja)) {
        nombreHoja = limpiarNombreHoja(
          `${matricula} - ${rangoCorto} (${intento})`
        );
        intento++;
      }
      hojasCreadas.add(nombreHoja);

      const datosFormateados = datos.map((row) => ({
        ...row,
        Fecha: formatFecha(row.Fecha),
        Monto: formatMonto(row.Monto),
      }));

      const hoja = XLSX.utils.json_to_sheet(datosFormateados);
      XLSX.utils.book_append_sheet(workbook, hoja, nombreHoja);
    });

    const now = new Date();
    const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1)
      .toString()
      .padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}_${now
      .getHours()
      .toString()
      .padStart(2, "0")}-${now.getMinutes().toString().padStart(2, "0")}`;
    const fileName = `Resumen_${timestamp}.xlsx`;

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    const data = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(data, fileName);
  };

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4 sm:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-md rounded-xl p-6">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">
          Procesador de Peajes
        </h1>

        <input
          type="file"
          accept=".xlsx, .xls"
          multiple
          onChange={handleFileUpload}
          className="mb-6 block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4
                     file:rounded-full file:border-0 file:text-sm file:font-semibold
                     file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />

        <h2 className="text-xl font-semibold mb-4 text-gray-700">
          Resumen por Matrícula
        </h2>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 border">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Matrícula
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cantidad de Peajes
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fuente
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(resumen).map(([matricula, cantidad]) => (
                <tr key={matricula}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {matricula}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {cantidad}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(fuentes[matricula] || []).join(" | ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 text-center space-y-4">
          <p className="text-gray-700">
            ¿Deseas generar el archivo Excel con este resumen?
          </p>
          <button
            onClick={exportToExcel}
            className="px-6 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700"
          >
            Confirmar y Exportar
          </button>
        </div>
      </div>
    </div>
  );
}
