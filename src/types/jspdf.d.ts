import 'jspdf';

declare module 'jspdf' {
  interface jsPDF {
    addNamedDestination(
      name: string,
      options: {
        pageNumber: number;
        x: number;
        y: number;
      }
    ): void;
    
    link(
      x: number,
      y: number,
      width: number,
      height: number,
      options: {
        page: number;
        link: string;
      }
    ): void;
    
    myText(
      text: string,
      x: number,
      y: number,
      link: string
    ): void;
    
    getCurrentPageInfo(): {
      pageNumber: number;
    };
  }
}
