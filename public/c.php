<?php
$path = $_SERVER["REQUEST_URI"];
$color = explode("/", $path)[2];
?>

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <?php
    print_r("<title>#{$color}</title>");
    print_r("<style>html,body{background-color:#${color}}</style>");
  ?>
</head>
<body>
</body>
</html>
