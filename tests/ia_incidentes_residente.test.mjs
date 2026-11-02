// node tests/ia_incidentes_residente.test.mjs
// Regresión sin enviar reportes ni notificaciones reales.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const edge=readFileSync(new URL("../supabase/functions/asistente-residencial-ia/index.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../asistente-ia.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../asistente-ia.css",import.meta.url),"utf8");
const sql=readFileSync(new URL("../database/ia_residente_reportar_incidente.sql",import.meta.url),"utf8");
new Function(edge.replace(/^import[^\n]*\n/,""));
new Function(ui);
for(const [,source] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Function(source);
const start=edge.indexOf("function incidentIntent(message){");
const end=edge.indexOf("\nasync function incidentAssistance(",start);
assert(start>=0&&end>start);
const classify=new Function(edge.slice(start,end)+"\nreturn incidentIntent;")();
for(const input of ["Reportar incidente","Quiero levantar un reporte de incidente",
 "Quiero reportar ruido","Necesito crear un reporte","Cómo reportar un incidente"])
 assert.equal(classify(input),"create",input);
for(const input of ["Mis reportes de incidentes","Consultar mis reportes","Ver seguimiento de incidente",
 "¿Cómo va mi reporte?","Estado de mi reporte"])
 assert.equal(classify(input),"list",input);
for(const input of ["Mis pagos","Reporte de mantenimiento","Multa y aviso"])
 assert.equal(classify(input),null,input);
assert.match(edge,/kind==="incident_create"/);
assert.match(edge,/ctx\.db\.rpc\("ia_residente_crear_incidente"/);
assert.match(edge,/\.eq\("reportado_por",ctx\.uid\)/);
assert.match(edge,/ctx\.p\.rol!=="residente"/);
assert.match(ui,/function incidentWizard\(parent,config\)/);
assert.match(ui,/openIncidentFollowup/);
assert.match(ui,/kind:"incident_create"/);
assert.match(ui,/window\.confirm/);
assert.match(ui,/\.maxLength=3000/);
assert.match(ui,/Reportar incidente/);
assert.match(ui,/Mis reportes de incidentes/);
assert.match(css,/\.ia-incidente-wizard/);
assert.match(html,/asistente-ia\.js\?v=8/);
assert.match(html,/asistente-ia\.css\?v=6/);
assert.match(sql,/SECURITY DEFINER SET search_path TO ''/);
assert.match(sql,/v_anterior\.reportado_por<>v_uid/);
assert.match(sql,/ia_solicitud_id/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.ia_residente_crear_incidente/);
assert.doesNotMatch(ui,/kind:"incident_delete"/);
console.log("PASS: incident intent, own-case follow-up, confirmation, UI, SQL authorization and syntax.");
