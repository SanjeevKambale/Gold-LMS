export const generateExcelXML = (headers: string[], data: any[][], widths: number[]) => {
  let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Bottom"/>
   <Borders/>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#4472C4" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Report">
  <Table>`;

  // Define column widths
  widths.forEach(width => {
    xml += `\n   <Column ss:Width="${width}"/>`;
  });

  // Add Headers
  xml += '\n   <Row ss:Height="25">';
  headers.forEach(header => {
    xml += `\n    <Cell ss:StyleID="Header"><Data ss:Type="String">${header}</Data></Cell>`;
  });
  xml += '\n   </Row>';

  // Add rows
  data.forEach(row => {
    xml += '\n   <Row>';
    row.forEach(cell => {
      const value = String(cell || '').replace(/[<>&'"]/g, c => {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case '\'': return '&apos;';
          case '"': return '&quot;';
          default: return c;
        }
      });
      xml += `\n    <Cell><Data ss:Type="String">${value}</Data></Cell>`;
    });
    xml += '\n   </Row>';
  });

  xml += `\n  </Table>
 </Worksheet>
</Workbook>`;
  return xml;
};
