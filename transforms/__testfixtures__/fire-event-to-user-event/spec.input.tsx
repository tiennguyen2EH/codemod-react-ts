import { render, fireEvent } from '@testing-library/react';
import { setup, renderWithRedux } from './test-utils';
import { Button, Input, Select } from './components';

describe('Component Tests', () => {
  it('should handle click events', () => {
    const { getByText } = setup(<Button>Click me</Button>);
    fireEvent.click(getByText('Click me'));
  });

  it('should handle hover events', () => {
    const { getByText } = setup(<Button>Hover me</Button>);
    fireEvent.mouseOver(getByText('Hover me'));
  });

  it('should handle blur events', () => {
    const { getByRole } = setup(<Input />);
    fireEvent.blur(getByRole('textbox'));
  });

  it('should handle change events', () => {
    const { getByRole } = setup(<Input />);
    fireEvent.change(getByRole('textbox'), {
      target: { value: 'new value' }
    });
  });

  it('should handle input events', () => {
    const { getByRole } = setup(<Input />);
    fireEvent.input(getByRole('textbox'), {
      target: { value: 'typed value' }
    });
  });

  it('should handle focus events', () => {
    const { getByRole } = setup(<Input />);
    fireEvent.focus(getByRole('textbox'));
  });

  it('should handle multiple events in sequence', () => {
    const { getByRole } = setup(<Input />);
    const input = getByRole('textbox');
    
    fireEvent.focus(input);
    fireEvent.change(input, {
      target: { value: 'new value' }
    });
    fireEvent.blur(input);
  });

  it('should work with Redux setup', () => {
    const { getByText } = renderWithRedux(<Button>Redux Button</Button>);
    fireEvent.click(getByText('Redux Button'));
  });

  it('should handle select change events', () => {
    const { getByRole } = setup(
      <Select>
        <option value="1">Option 1</option>
        <option value="2">Option 2</option>
      </Select>
    );
    
    fireEvent.change(getByRole('combobox'), {
      target: { value: '2' }
    });
  });

  it('should handle mouse out events', () => {
    const { getByText } = setup(<Button>Hover me</Button>);
    fireEvent.mouseOut(getByText('Hover me'));
  });
}); 