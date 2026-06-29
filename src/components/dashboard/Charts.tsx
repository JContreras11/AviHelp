"use client";

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Analytics } from "@/app/actions/analytics";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PALETA = ["#7c3aed", "#14b8a6", "#f59e0b", "#ef4444", "#a78bfa", "#6b7280"];

const COLOR_ESTADO: Record<string, string> = {
  desaparecido: "#ef4444",
  herido: "#f59e0b",
  fallecido: "#6b7280",
  vivo: "#22c55e",
};

function colorEstado(estado: string, i: number) {
  return COLOR_ESTADO[estado.toLowerCase()] ?? PALETA[i % PALETA.length];
}

function titulo(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

// Estado vacío reutilizable: la gráfica de recharts con data vacía queda en blanco
// y sin lectura para lectores de pantalla; mostramos un mensaje claro en su lugar.
function Vacio({ children = "Sin datos todavía" }: { children?: React.ReactNode }) {
  return (
    <div className="h-[260px] w-full grid place-items-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function Charts({ data }: { data: Analytics }) {
  // Guardas: data vacía nunca debe romper el render (arrays pueden venir vacíos).
  const personasPorEstado = (data.personasPorEstado ?? []).map((d) => ({
    ...d,
    label: titulo(d.estado),
  }));
  const insumosPorEstado = (data.insumosPorEstado ?? []).map((d) => ({
    ...d,
    label: titulo(d.estado),
  }));
  const insumosPorPrioridad = (data.insumosPorPrioridad ?? []).map((d) => ({
    ...d,
    label: titulo(d.prioridad),
  }));
  const completitud = data.completitud ?? [];
  const zonas = data.zonas ?? [];
  const hospitales = data.hospitales ?? [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Personas por estado */}
      <Card>
        <CardHeader>
          <CardTitle>Personas por estado</CardTitle>
        </CardHeader>
        <CardContent>
          {personasPorEstado.length ? (
            <div className="h-[260px] w-full" role="img" aria-label="Gráfica de barras: personas por estado">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={personasPorEstado} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(124,58,237,0.08)" }}
                    formatter={(v) => [v, "Personas"]}
                  />
                  <Bar dataKey="n" radius={[6, 6, 0, 0]}>
                    {personasPorEstado.map((d, i) => (
                      <Cell key={d.estado} fill={colorEstado(d.estado, i)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Vacio>Sin personas registradas</Vacio>
          )}
        </CardContent>
      </Card>

      {/* Insumos por estado (donut) */}
      <Card>
        <CardHeader>
          <CardTitle>Insumos por estado</CardTitle>
        </CardHeader>
        <CardContent>
          {insumosPorEstado.length ? (
            <div className="h-[260px] w-full" role="img" aria-label="Gráfica circular: insumos por estado">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={insumosPorEstado}
                    dataKey="n"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {insumosPorEstado.map((d, i) => (
                      <Cell key={d.estado} fill={PALETA[i % PALETA.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                  <Legend verticalAlign="bottom" height={24} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Vacio>Sin insumos registrados</Vacio>
          )}
        </CardContent>
      </Card>

      {/* Insumos por prioridad */}
      <Card>
        <CardHeader>
          <CardTitle>Insumos por prioridad</CardTitle>
        </CardHeader>
        <CardContent>
          {insumosPorPrioridad.length ? (
            <div className="h-[260px] w-full" role="img" aria-label="Gráfica de barras: insumos por prioridad">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={insumosPorPrioridad} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(20,184,166,0.08)" }}
                    formatter={(v) => [v, "Insumos"]}
                  />
                  <Bar dataKey="n" radius={[6, 6, 0, 0]}>
                    {insumosPorPrioridad.map((d, i) => (
                      <Cell key={d.prioridad} fill={PALETA[i % PALETA.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Vacio>Sin insumos registrados</Vacio>
          )}
        </CardContent>
      </Card>

      {/* Completitud de datos */}
      <Card>
        <CardHeader>
          <CardTitle>Completitud de datos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          {completitud.length ? (
            completitud.map((c) => (
              <div key={c.campo} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{c.campo}</span>
                  <span className="tabular-nums text-muted-foreground">{c.pct}%</span>
                </div>
                <Progress value={c.pct} aria-label={`Completitud ${c.campo}: ${c.pct}%`} />
              </div>
            ))
          ) : (
            <Vacio>Sin datos de completitud</Vacio>
          )}
        </CardContent>
      </Card>

      {/* Zonas más afectadas */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Zonas más afectadas</CardTitle>
        </CardHeader>
        <CardContent>
          {zonas.length ? (
            <div role="img" aria-label="Gráfica de barras horizontales: zonas más afectadas por personas y críticos">
              <ResponsiveContainer width="100%" height={Math.max(260, zonas.length * 34)}>
                <BarChart data={zonas} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="zona" width={90} interval={0} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="n" name="Personas" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="criticos" name="Críticos" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Vacio>Sin zonas con datos</Vacio>
          )}
        </CardContent>
      </Card>

      {/* Hospitales */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Hospitales — prioridad de atención</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hospital</TableHead>
                  <TableHead className="text-right">Personas</TableHead>
                  <TableHead className="text-right">Insumos</TableHead>
                  <TableHead className="text-center">Críticos</TableHead>
                  <TableHead className="min-w-[160px]">Entregados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hospitales.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>
                      <div className="font-medium">{h.nombre}</div>
                      {h.ubicacion ? (
                        <div className="text-xs text-muted-foreground">{h.ubicacion}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {h.personas}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {h.insumos}
                    </TableCell>
                    <TableCell className="text-center">
                      {h.criticos > 0 ? (
                        <Badge
                          variant="destructive"
                          className={
                            h.criticos > 3
                              ? "bg-red-600 text-white"
                              : "bg-amber-500 text-white"
                          }
                        >
                          {h.criticos}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">0</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={h.completitud} className="flex-1" />
                        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                          {h.completitud}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {hospitales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Sin hospitales registrados
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default Charts;
