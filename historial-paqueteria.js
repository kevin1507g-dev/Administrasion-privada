// Consulta de movimientos de Paquetería; solo Sistema Admin. Sin órdenes al portón.
(function(){
  "use strict";
  let loading = false;
  const get = id => document.getElementById(id);
  const owner = () => document.body?.dataset?.sessionRole === "owner" &&
    document.body?.dataset?.ownerPanel === "owner";
  const fmt = value => {
    if(!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" :
      d.toLocaleString("es-MX",{dateStyle:"short",timeStyle:"medium"});
  };
  async function load(){
    const section=get("accesos"),rows=get("parcelHistoryRows");
    const status=get("parcelHistoryStatus"),panel=get("accesos-panel-paqueteria");
    if(loading || !owner() || !section?.classList.contains("active") ||
       panel?.hidden || !rows || !status)return;
    loading=true;
    const requester=profile?.id;
    status.textContent="Consultando movimientos de Paquetería…";
    try{
      const {data,error}=await sb.rpc("parcel_window_history",{p_limit:50});
      if(error)throw error;
      if(!owner() || profile?.id!==requester ||
         !section.classList.contains("active") || panel?.hidden)return;
      if(!Array.isArray(data))throw new Error("Respuesta inválida.");
      rows.replaceChildren();
      if(data.length===0){
        const row=rows.insertRow(),cell=row.insertCell();
        cell.colSpan=5;cell.textContent="Todavía no hay movimientos de Paquetería registrados.";
      } else {
        const roles={owner:"Sistema Admin",admin:"Administrador",residente:"Residente",guardia:"Guardia"};
        for(const item of data){
          const row=rows.insertRow();
          const action=item.action==="start"?"📦 Activó Paquetería":
            item.action==="stop"?"⏹ Canceló Paquetería":"Movimiento";
          const values=[
            fmt(item.performed_at),
            String(item.actor||"Cuenta no disponible")+" · "+(roles[item.role]||"Cuenta"),
            item.house&&item.house!=="—"?"Casa "+String(item.house):"—",
            action,
            item.action==="start"?fmt(item.ends_at):"—"
          ];
          for(const value of values)row.insertCell().textContent=value;
        }
      }
      status.textContent=data.length+" movimiento(s) mostrados · "+new Date().toLocaleString("es-MX");
    }catch(err){
      if(owner()&&profile?.id===requester)
        status.textContent="No fue posible consultar Paquetería: "+(err?.message||"sin conexión");
    }finally{loading=false;}
  }
  window.cargarHistorialPaqueteriaOwner=load;
})();