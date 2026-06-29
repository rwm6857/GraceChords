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
          <h1>Something went wrong.</h1>
          <p><a href="#" onClick={e=>{e.preventDefault(); window.location.reload();}}>Reload</a></p>
        </div>
      );
    }
    return this.props.children;
  }
}
