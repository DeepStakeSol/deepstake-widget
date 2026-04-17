import React, { useState } from 'react';

// The main widget component
const EmbeddedWidget = ({ initialCount = 0 }) => {
  const [count, setCount] = useState(initialCount);

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', maxWidth: '300px', textAlign: 'center' }}>
      <h2>Embedded Counter</h2>
      <p>Count: {count}</p>
      <button
        style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
        onClick={() => setCount(count + 1)}
      >
        Increment
      </button>
    </div>
  );
};

// Function to mount the widget
window.mountWidget = function (elementId, props = {}) {
  const ReactDOM = require('react-dom');
  const rootElement = document.getElementById(elementId);
  if (rootElement) {
    ReactDOM.render(<EmbeddedWidget {...props} />, rootElement);
  } else {
    console.error(`Element with ID ${elementId} not found.`);
  }
};

export default EmbeddedWidget;