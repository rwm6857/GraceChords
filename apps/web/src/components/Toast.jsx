import React, { useEffect, useState } from 'react';
import { onToast } from '../utils/app/toast';

export default function Toast(){
  const [items, setItems] = useState([]);

  useEffect(() => {
    return onToast(msg => {
      const id = Date.now() + Math.random();
      setItems(list => [...list, { id, msg }]);
      setTimeout(() => {
        setItems(list => list.filter(i => i.id !== id));
      }, 4000);
    });
  }, []);

  return (
    <div style={{position:'fixed', top:10, right:10, zIndex:1000}}>
      {items.map(it => (
        <div key={it.id} style={{background:'#333', color:'#fff', padding:'8px 12px', marginTop:8, borderRadius:4, boxShadow:'0 2px 6px rgba(0,0,0,0.3)'}}>
          {it.msg}
        </div>
      ))}
    </div>
  );
}
