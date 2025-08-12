import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error){
    return { error };
  }
  componentDidCatch(error, info){
    console.error(error, info);
  }
  render(){
    if(this.state.error){
      return (
        <div className="container" style={{padding:'2rem'}}>
          <h2>Something went wrong.</h2>
          <p><a href="#" onClick={e=>{e.preventDefault(); window.location.reload();}}>Reload</a></p>
        </div>
      );
    }
    return this.props.children;
  }
}
