import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state = { error: null, copied: false };
  }
  static getDerivedStateFromError(error){
    return { error };
  }
  componentDidCatch(error, info){
    console.error(error, info);
    this.setState({ info });
  }
  buildReport(){
    const { error, info } = this.state;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const href = typeof window !== 'undefined' ? window.location.href : '';
    const name = error?.name || 'Error';
    const message = error?.message || String(error);
    const stack = error?.stack || '';
    const componentStack = info?.componentStack || '';
    return [
      `${name}: ${message}`,
      href && `URL: ${href}`,
      ua && `UA: ${ua}`,
      stack && `\nStack:\n${stack}`,
      componentStack && `\nComponent stack:${componentStack}`,
    ].filter(Boolean).join('\n');
  }
  render(){
    if(this.state.error){
      const report = this.buildReport();
      return (
        <div className="container" style={{padding:'2rem', maxWidth: 720, margin: '0 auto'}}>
          <h1>Something went wrong.</h1>
          <p>
            <a href="#" onClick={e=>{e.preventDefault(); window.location.reload();}}>Reload</a>
          </p>
          {/* Error detail is surfaced on-screen so it can be read/screenshotted
              on devices without a developer console (e.g. mobile browsers). */}
          <p style={{fontWeight:600, marginBottom:4}}>Error detail</p>
          <textarea
            readOnly
            value={report}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              width:'100%', minHeight:160, fontFamily:'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize:12, lineHeight:1.4, padding:10, borderRadius:8,
              border:'1px solid rgba(127,127,127,.4)', background:'rgba(127,127,127,.08)',
              color:'inherit', whiteSpace:'pre', overflow:'auto',
            }}
          />
          <p>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(report);
                  this.setState({ copied: true });
                } catch { /* clipboard unavailable — user can select the text above */ }
              }}
              style={{
                marginTop:8, padding:'8px 14px', borderRadius:8, cursor:'pointer',
                border:'1px solid rgba(127,127,127,.4)', background:'transparent', color:'inherit', fontWeight:600,
              }}
            >
              {this.state.copied ? 'Copied ✓' : 'Copy error'}
            </button>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
