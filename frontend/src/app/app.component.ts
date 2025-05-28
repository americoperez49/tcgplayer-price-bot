import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router'; // Import RouterLink

@Component({
  selector: 'app-root',
  standalone: true, // Ensure it's standalone
  imports: [RouterOutlet, RouterLink], // Add RouterLink
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  // title = 'frontend'; // Remove or comment out title
}
